import OpenAI from 'openai';

// Perplexity uses OpenAI-compatible API
export async function queryPerplexity(
  apiKey: string,
  prompt: string,
  model: string = 'sonar'
): Promise<string> {
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.perplexity.ai',
  });

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    max_tokens: 2048,
  });

  return response.choices[0]?.message?.content || '';
}

export async function testPerplexityConnection(apiKey: string): Promise<boolean> {
  try {
    const client = new OpenAI({
      apiKey,
      baseURL: 'https://api.perplexity.ai',
    });
    // Simple test: try to create a minimal message
    await client.chat.completions.create({
      model: 'sonar',
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 10,
    });
    return true;
  } catch {
    return false;
  }
}
