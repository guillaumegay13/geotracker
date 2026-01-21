import OpenAI from 'openai';

export async function queryOpenAI(
  apiKey: string,
  prompt: string,
  model: string = 'gpt-4o'
): Promise<string> {
  const client = new OpenAI({ apiKey });

  // Use web search for search-preview models
  const useWebSearch = model.includes('search');

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    max_tokens: 2048,
    ...(useWebSearch && {
      web_search_options: {
        search_context_size: 'medium',
      },
    }),
  } as OpenAI.ChatCompletionCreateParamsNonStreaming);

  return response.choices[0]?.message?.content || '';
}

export async function testOpenAIConnection(apiKey: string): Promise<boolean> {
  try {
    const client = new OpenAI({ apiKey });
    await client.models.list();
    return true;
  } catch {
    return false;
  }
}
