import { NextRequest, NextResponse } from 'next/server';
import { testOpenAIConnection } from '@/lib/providers/openai';
import { testAnthropicConnection } from '@/lib/providers/anthropic';
import { testPerplexityConnection } from '@/lib/providers/perplexity';
import { Provider } from '@/lib/types';

interface TestRequest {
  provider: Provider;
  api_key: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: TestRequest = await request.json();
    const { provider, api_key } = body;

    if (!provider || !api_key) {
      return NextResponse.json({ error: 'provider and api_key are required' }, { status: 400 });
    }

    let testFn: (key: string) => Promise<boolean>;

    switch (provider) {
      case 'openai':
        testFn = testOpenAIConnection;
        break;
      case 'anthropic':
        testFn = testAnthropicConnection;
        break;
      case 'perplexity':
        testFn = testPerplexityConnection;
        break;
      default:
        return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
    }

    const success = await testFn(api_key);

    return NextResponse.json({ success, provider });
  } catch (error) {
    console.error('Error testing provider:', error);
    return NextResponse.json({ error: 'Failed to test provider connection' }, { status: 500 });
  }
}
