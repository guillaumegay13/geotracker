import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { Settings } from '@/lib/types';
import { queryOpenAI } from '@/lib/providers/openai';
import { queryAnthropic } from '@/lib/providers/anthropic';

interface GenerateRequest {
  topic: string;
  category?: string;
}

const SYSTEM_PROMPT = `You are an expert at creating prompts for testing AI visibility and GEO (Generative Engine Optimization).

Your task is to generate a natural, conversational prompt that a real user might ask an AI assistant. The prompt should:
1. Be a genuine question or request that would naturally lead to product/service recommendations
2. Include relevant context that makes the question specific and realistic
3. Be phrased naturally, as a real person would ask
4. Be optimized for GEO - designed to surface mentions of specific brands/products in AI responses

Do NOT:
- Include any meta-instructions or explanations
- Make the prompt sound artificial or SEO-stuffed
- Use generic phrasing

Output ONLY the prompt text, nothing else.`;

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequest = await request.json();
    const { topic, category } = body;

    if (!topic) {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 });
    }

    const db = getDb();
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as Settings;

    // Try providers in order: OpenAI, Anthropic
    let generatedPrompt: string | null = null;

    const userMessage = category
      ? `Generate a GEO-optimized prompt about: ${topic}\nCategory: ${category}`
      : `Generate a GEO-optimized prompt about: ${topic}`;

    if (settings.openai_api_key) {
      try {
        generatedPrompt = await queryOpenAI(
          settings.openai_api_key,
          `${SYSTEM_PROMPT}\n\n${userMessage}`,
          'gpt-4o-mini'
        );
      } catch (e) {
        console.error('OpenAI generation failed:', e);
      }
    }

    if (!generatedPrompt && settings.anthropic_api_key) {
      try {
        generatedPrompt = await queryAnthropic(
          settings.anthropic_api_key,
          `${SYSTEM_PROMPT}\n\n${userMessage}`,
          'claude-haiku-4-20250514'
        );
      } catch (e) {
        console.error('Anthropic generation failed:', e);
      }
    }

    if (!generatedPrompt) {
      return NextResponse.json(
        { error: 'No API keys configured or all providers failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({ prompt: generatedPrompt.trim() });
  } catch (error) {
    console.error('Error generating prompt:', error);
    return NextResponse.json({ error: 'Failed to generate prompt' }, { status: 500 });
  }
}
