import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { Prompt } from '@/lib/types';

export async function GET() {
  try {
    const db = getDb();
    const prompts = db.prepare('SELECT * FROM prompts ORDER BY created_at DESC').all() as Prompt[];
    return NextResponse.json(prompts);
  } catch (error) {
    console.error('Error fetching prompts:', error);
    return NextResponse.json({ error: 'Failed to fetch prompts' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, content, category } = body;

    if (!name || !content) {
      return NextResponse.json({ error: 'Name and content are required' }, { status: 400 });
    }

    const db = getDb();
    const result = db
      .prepare('INSERT INTO prompts (name, content, category) VALUES (?, ?, ?)')
      .run(name, content, category || null);

    const prompt = db.prepare('SELECT * FROM prompts WHERE id = ?').get(result.lastInsertRowid) as Prompt;

    return NextResponse.json(prompt, { status: 201 });
  } catch (error) {
    console.error('Error creating prompt:', error);
    return NextResponse.json({ error: 'Failed to create prompt' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Prompt ID is required' }, { status: 400 });
    }

    const db = getDb();
    const result = db.prepare('DELETE FROM prompts WHERE id = ?').run(id);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Prompt not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting prompt:', error);
    return NextResponse.json({ error: 'Failed to delete prompt' }, { status: 500 });
  }
}
