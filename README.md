# GEO Tracker

Track your website's visibility in AI responses. Monitor how often AI models mention or cite your domain when answering relevant prompts.

## Features

- Track mentions and citations across multiple AI providers (OpenAI, Anthropic, Perplexity)
- Create and manage prompt libraries
- View detailed run history with response analysis
- Dashboard with visibility metrics

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 3. Configure settings

1. Go to **Settings**
2. Enter your tracked domain (e.g., `example.com`)
3. Add API keys for the providers you want to use:
   - OpenAI API key
   - Anthropic API key
   - Perplexity API key

### 4. Create prompts

1. Go to **Prompts**
2. Add prompts that are relevant to your domain
3. Example: "What are the best tools for X?" where X relates to your product

### 5. Run tracking

1. Go to **Runs**
2. Select a prompt and choose models to test
3. Execute and view results

## Tech Stack

- Next.js 15
- SQLite (better-sqlite3)
- Tailwind CSS

## Data Storage

All data is stored locally in a SQLite database (`geotracker.db`). API keys are stored in this database - do not share the `.db` file.

## License

MIT
