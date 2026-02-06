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

export async function GET() {
  try {
    const db = getDb();
    const runs = db
      .prepare(
        `SELECT runs.*, prompts.name as prompt_name, prompts.content as prompt_content
         FROM runs
         JOIN prompts ON runs.prompt_id = prompts.id
         ORDER BY runs.created_at DESC
         LIMIT 100`
      )
      .all() as (RunWithPrompt & { signals: string })[];

    // Parse signals JSON
    const parsedRuns = runs.map((run) => ({
      ...run,
      signals: JSON.parse(run.signals) as Signal,
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
