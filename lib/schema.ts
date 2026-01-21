export const SCHEMA = `
-- Settings table (single row for MVP)
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  tracked_domain TEXT NOT NULL DEFAULT '',
  openai_api_key TEXT,
  anthropic_api_key TEXT,
  perplexity_api_key TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Prompts library
CREATE TABLE IF NOT EXISTS prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Run history
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_id INTEGER REFERENCES prompts(id),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  response TEXT NOT NULL,
  signals TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default settings row if not exists
INSERT OR IGNORE INTO settings (id, tracked_domain) VALUES (1, '');
`;

export const SEED_PROMPTS = [
  {
    name: 'Best tools for SEO',
    content: 'What are the best tools for search engine optimization in 2025?',
    category: 'SEO',
  },
  {
    name: 'Top marketing platforms',
    content: 'What are the top marketing automation platforms for small businesses?',
    category: 'Marketing',
  },
  {
    name: 'Website analytics solutions',
    content: 'What website analytics solutions do you recommend for tracking user behavior?',
    category: 'Analytics',
  },
];
