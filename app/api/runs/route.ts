import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { Run, RunWithPrompt, Settings, Signal, Provider } from '@/lib/types';
import { extractSignals } from '@/lib/signals';
import { queryOpenAI } from '@/lib/providers/openai';
import { queryAnthropic } from '@/lib/providers/anthropic';
import { queryPerplexity } from '@/lib/providers/perplexity';

interface RunRequest {
  prompt_ids: number[];
  providers: { provider: Provider; model: string }[];
}

const DEFAULT_RUN_LIMIT = 50;
const MAX_RUN_LIMIT = 200;
const SUMMARY_RESPONSE_CHARS = 420;

function clampLimit(value: string | null): number {
  if (!value) return DEFAULT_RUN_LIMIT;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_RUN_LIMIT;
  return Math.min(MAX_RUN_LIMIT, Math.max(1, Math.floor(parsed)));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const includeResponse = searchParams.get('include_response') === '1';
    const limit = clampLimit(searchParams.get('limit'));

    const db = getDb();
    if (id) {
      const run = db
        .prepare(
          `SELECT runs.*, prompts.name as prompt_name, prompts.content as prompt_content
           FROM runs
           JOIN prompts ON runs.prompt_id = prompts.id
           WHERE runs.id = ?`
        )
        .get(id) as (RunWithPrompt & { signals: string }) | undefined;

      if (!run) {
        return NextResponse.json({ error: 'Run not found' }, { status: 404 });
      }

      return NextResponse.json({
        ...run,
        signals: JSON.parse(run.signals) as Signal,
      });
    }

    const responseSelection = includeResponse
      ? 'runs.response as response'
      : `substr(runs.response, 1, ${SUMMARY_RESPONSE_CHARS}) as response`;

    const runs = db
      .prepare(
        `SELECT runs.id, runs.prompt_id, runs.provider, runs.model, ${responseSelection}, runs.signals, runs.created_at,
                prompts.name as prompt_name, '' as prompt_content
         FROM runs
         JOIN prompts ON runs.prompt_id = prompts.id
         ORDER BY runs.created_at DESC
         LIMIT ?`
      )
      .all(limit) as (RunWithPrompt & { signals: string })[];

    const parsedRuns = runs.map((run) => ({
      ...run,
      signals: (() => {
        const parsed = JSON.parse(run.signals) as Signal;
        if (includeResponse) return parsed;
        return {
          ...parsed,
          urls: parsed.urls.slice(0, 6),
          context: parsed.context.slice(0, 2).map((item) => item.slice(0, 220)),
        };
      })(),
    }));

    return NextResponse.json(parsedRuns);
  } catch (error) {
    console.error('Error fetching runs:', error);
    return NextResponse.json({ error: 'Failed to fetch runs' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: RunRequest = await request.json();
    const { prompt_ids, providers } = body;

    if (!prompt_ids || prompt_ids.length === 0 || !providers || providers.length === 0) {
      return NextResponse.json({ error: 'prompt_ids and providers are required' }, { status: 400 });
    }

    const db = getDb();

    // Get all prompts
    const placeholders = prompt_ids.map(() => '?').join(',');
    const prompts = db.prepare(`SELECT * FROM prompts WHERE id IN (${placeholders})`).all(...prompt_ids) as {
      id: number;
      content: string;
      name: string;
    }[];

    if (prompts.length === 0) {
      return NextResponse.json({ error: 'No prompts found' }, { status: 404 });
    }

    // Get settings for API keys and tracked domain
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as Settings;

    const results: RunWithPrompt[] = [];

    // Execute all prompt+model combinations in parallel
    const promises = prompts.flatMap((prompt) =>
      providers.map(async ({ provider, model }) => {
        let apiKey: string | null = null;
        let queryFn: (key: string, prompt: string, model: string) => Promise<string>;

        switch (provider) {
          case 'openai':
            apiKey = settings.openai_api_key;
            queryFn = queryOpenAI;
            break;
          case 'anthropic':
            apiKey = settings.anthropic_api_key;
            queryFn = queryAnthropic;
            break;
          case 'perplexity':
            apiKey = settings.perplexity_api_key;
            queryFn = queryPerplexity;
            break;
          default:
            throw new Error(`Unknown provider: ${provider}`);
        }

        if (!apiKey) {
          throw new Error(`API key not configured for ${provider}`);
        }

        // Query the AI provider
        const response = await queryFn(apiKey, prompt.content, model);

        // Extract signals
        const signals = extractSignals(response, settings.tracked_domain);

        // Store the run
        const result = db
          .prepare('INSERT INTO runs (prompt_id, provider, model, response, signals) VALUES (?, ?, ?, ?, ?)')
          .run(prompt.id, provider, model, response, JSON.stringify(signals));

        const run = db.prepare('SELECT * FROM runs WHERE id = ?').get(result.lastInsertRowid) as Run & {
          signals: string;
        };

        return {
          ...run,
          signals: JSON.parse(run.signals) as Signal,
          prompt_name: prompt.name,
          prompt_content: prompt.content,
        };
      })
    );

    const completedRuns = await Promise.allSettled(promises);

    for (const result of completedRuns) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        console.error('Run failed:', result.reason);
      }
    }

    if (results.length === 0) {
      return NextResponse.json({ error: 'All runs failed' }, { status: 500 });
    }

    return NextResponse.json(results, { status: 201 });
  } catch (error) {
    console.error('Error executing runs:', error);
    return NextResponse.json({ error: 'Failed to execute runs' }, { status: 500 });
  }
}
