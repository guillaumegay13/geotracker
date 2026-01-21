import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { Settings } from '@/lib/types';

export async function GET() {
  try {
    const db = getDb();
    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as Settings | undefined;

    if (!settings) {
      return NextResponse.json({
        id: 1,
        tracked_domain: '',
        openai_api_key: null,
        anthropic_api_key: null,
        perplexity_api_key: null,
        updated_at: new Date().toISOString(),
      });
    }

    // Mask API keys for security (only show last 4 chars)
    const maskedSettings = {
      ...settings,
      openai_api_key: settings.openai_api_key ? `***${settings.openai_api_key.slice(-4)}` : null,
      anthropic_api_key: settings.anthropic_api_key ? `***${settings.anthropic_api_key.slice(-4)}` : null,
      perplexity_api_key: settings.perplexity_api_key ? `***${settings.perplexity_api_key.slice(-4)}` : null,
    };

    return NextResponse.json(maskedSettings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tracked_domain, openai_api_key, anthropic_api_key, perplexity_api_key } = body;

    const db = getDb();

    // Get current settings to preserve existing keys if new ones not provided
    const current = db.prepare('SELECT * FROM settings WHERE id = 1').get() as Settings | undefined;

    const updates: string[] = [];
    const values: (string | null)[] = [];

    if (tracked_domain !== undefined) {
      updates.push('tracked_domain = ?');
      values.push(tracked_domain);
    }

    // Only update API keys if they're provided and not masked
    if (openai_api_key !== undefined && !openai_api_key?.startsWith('***')) {
      updates.push('openai_api_key = ?');
      values.push(openai_api_key || null);
    }

    if (anthropic_api_key !== undefined && !anthropic_api_key?.startsWith('***')) {
      updates.push('anthropic_api_key = ?');
      values.push(anthropic_api_key || null);
    }

    if (perplexity_api_key !== undefined && !perplexity_api_key?.startsWith('***')) {
      updates.push('perplexity_api_key = ?');
      values.push(perplexity_api_key || null);
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      const sql = `UPDATE settings SET ${updates.join(', ')} WHERE id = 1`;
      db.prepare(sql).run(...values);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
