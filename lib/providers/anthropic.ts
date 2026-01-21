import Anthropic from '@anthropic-ai/sdk';

export async function queryAnthropic(
  apiKey: string,
  prompt: string,
  model: string = 'claude-sonnet-4-20250514'
): Promise<string> {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  // Extract text from content blocks
  const textBlocks = response.content.filter((block) => block.type === 'text');
  return textBlocks.map((block) => block.text).join('\n');
}

export async function testAnthropicConnection(apiKey: string): Promise<boolean> {
  try {
    const client = new Anthropic({ apiKey });
    // Simple test: try to create a minimal message
    await client.messages.create({
      model: 'claude-haiku-4-20250514',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Hi' }],
    });
    return true;
  } catch {
    return false;
  }
}
