import Database from 'better-sqlite3';
import path from 'path';
import { SCHEMA, SEED_PROMPTS } from './schema';

const DB_PATH = path.join(process.cwd(), 'geotracker.db');

// Use global to persist connection across hot reloads in dev
const globalForDb = globalThis as unknown as { db: Database.Database | undefined };

export function getDb(): Database.Database {
  if (!globalForDb.db) {
    globalForDb.db = new Database(DB_PATH);
    globalForDb.db.pragma('journal_mode = WAL');
    globalForDb.db.pragma('synchronous = NORMAL');
    initializeSchema(globalForDb.db);
  }
  return globalForDb.db;
}

function initializeSchema(database: Database.Database): void {
  // Run schema creation
  database.exec(SCHEMA);

  // Check if prompts table is empty and seed if needed
  const count = database.prepare('SELECT COUNT(*) as count FROM prompts').get() as { count: number };
  if (count.count === 0) {
    const insert = database.prepare('INSERT INTO prompts (name, content, category) VALUES (?, ?, ?)');
    for (const prompt of SEED_PROMPTS) {
      insert.run(prompt.name, prompt.content, prompt.category);
    }
  }
}

export function closeDb(): void {
  if (globalForDb.db) {
    globalForDb.db.close();
    globalForDb.db = undefined;
  }
}
