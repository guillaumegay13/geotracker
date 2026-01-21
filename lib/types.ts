export interface Settings {
  id: number;
  tracked_domain: string;
  openai_api_key: string | null;
  anthropic_api_key: string | null;
  perplexity_api_key: string | null;
  updated_at: string;
}

export interface Prompt {
  id: number;
  name: string;
  content: string;
  category: string | null;
  created_at: string;
}

export interface Signal {
  mentioned: boolean;
  cited: boolean;
  urls: string[];
  context: string[];
}

export interface Run {
  id: number;
  prompt_id: number;
  provider: 'openai' | 'anthropic' | 'perplexity';
  model: string;
  response: string;
  signals: Signal;
  created_at: string;
}

export interface RunWithPrompt extends Run {
  prompt_name: string;
  prompt_content: string;
}

export type Provider = 'openai' | 'anthropic' | 'perplexity';

export interface ProviderConfig {
  name: Provider;
  models: string[];
  displayName: string;
}

export const PROVIDERS: ProviderConfig[] = [
  {
    name: 'openai',
    models: ['gpt-4o-search-preview', 'gpt-4o', 'gpt-4o-mini'],
    displayName: 'OpenAI',
  },
  {
    name: 'anthropic',
    models: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250514'],
    displayName: 'Anthropic',
  },
  {
    name: 'perplexity',
    models: ['sonar-pro', 'sonar'],
    displayName: 'Perplexity',
  },
];
