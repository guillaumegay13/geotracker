import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { Collection } from '@/lib/types';

export async function GET() {
  try {
    const db = getDb();
    const collections = db.prepare('SELECT * FROM collections ORDER BY name').all() as Collection[];

    // Get prompt IDs for each collection
    const collectionsWithPrompts = collections.map((collection) => {
      const promptIds = db
        .prepare('SELECT prompt_id FROM prompt_collections WHERE collection_id = ?')
        .all(collection.id) as { prompt_id: number }[];
      return {
        ...collection,
        prompt_ids: promptIds.map((p) => p.prompt_id),
      };
    });

    return NextResponse.json(collectionsWithPrompts);
  } catch (error) {
    console.error('Error fetching collections:', error);
    return NextResponse.json({ error: 'Failed to fetch collections' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, prompt_ids } = body as { name: string; prompt_ids?: number[] };

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const db = getDb();

    // Create collection
    const result = db.prepare('INSERT INTO collections (name) VALUES (?)').run(name);
    const collectionId = result.lastInsertRowid;

    // Add prompts to collection
    if (prompt_ids && prompt_ids.length > 0) {
      const insertPrompt = db.prepare(
        'INSERT OR IGNORE INTO prompt_collections (prompt_id, collection_id) VALUES (?, ?)'
      );
      for (const promptId of prompt_ids) {
        insertPrompt.run(promptId, collectionId);
      }
    }

    return NextResponse.json({ id: collectionId, name, prompt_ids: prompt_ids || [] }, { status: 201 });
  } catch (error) {
    console.error('Error creating collection:', error);
    return NextResponse.json({ error: 'Failed to create collection' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, prompt_ids } = body as { id: number; prompt_ids: number[] };

    if (!id) {
      return NextResponse.json({ error: 'Collection ID is required' }, { status: 400 });
    }

    const db = getDb();

    // Clear existing prompts and add new ones
    db.prepare('DELETE FROM prompt_collections WHERE collection_id = ?').run(id);

    if (prompt_ids && prompt_ids.length > 0) {
      const insertPrompt = db.prepare(
        'INSERT OR IGNORE INTO prompt_collections (prompt_id, collection_id) VALUES (?, ?)'
      );
      for (const promptId of prompt_ids) {
        insertPrompt.run(promptId, id);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating collection:', error);
    return NextResponse.json({ error: 'Failed to update collection' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const db = getDb();
    db.prepare('DELETE FROM collections WHERE id = ?').run(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting collection:', error);
    return NextResponse.json({ error: 'Failed to delete collection' }, { status: 500 });
  }
}
