'use client';

import { useEffect, useState } from 'react';
import { PROVIDERS } from '@/lib/types';

interface SettingsForm {
  tracked_domain: string;
  openai_api_key: string;
  anthropic_api_key: string;
  perplexity_api_key: string;
}

export default function SettingsPage() {
  const [form, setForm] = useState<SettingsForm>({
    tracked_domain: '',
    openai_api_key: '',
    anthropic_api_key: '',
    perplexity_api_key: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, boolean | null>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        setForm({
          tracked_domain: data.tracked_domain || '',
          openai_api_key: data.openai_api_key || '',
          anthropic_api_key: data.anthropic_api_key || '',
          perplexity_api_key: data.perplexity_api_key || '',
        });
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (response.ok) {
        setMessage({ type: 'success', text: 'Settings saved' });
      } else {
        throw new Error('Failed to save');
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    }
    setSaving(false);
  };

  const handleTest = async (provider: 'openai' | 'anthropic' | 'perplexity') => {
    const keyField = `${provider}_api_key` as keyof SettingsForm;
    const apiKey = form[keyField];

    if (!apiKey || apiKey.startsWith('***')) {
      setMessage({ type: 'error', text: 'Enter a valid API key first' });
      return;
    }

    setTesting(provider);
    setTestResults((prev) => ({ ...prev, [provider]: null }));

    try {
      const response = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, api_key: apiKey }),
      });
      const data = await response.json();
      setTestResults((prev) => ({ ...prev, [provider]: data.success }));
    } catch {
      setTestResults((prev) => ({ ...prev, [provider]: false }));
    }
    setTesting(null);
  };

  if (loading) {
    return <div className="text-[--dim]">Loading...</div>;
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-lg">Settings</h1>

      {message && (
        <p className={message.type === 'success' ? 'text-[--green]' : 'text-[--red]'}>
          {message.text}
        </p>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-[--dim] mb-1">Tracked Domain</label>
          <input
            type="text"
            value={form.tracked_domain}
            onChange={(e) => setForm({ ...form, tracked_domain: e.target.value })}
            placeholder="example.com"
            className="w-full"
          />
        </div>

        <div className="border-t border-[--dim] pt-4">
          <p className="text-sm text-[--dim] mb-4">API Keys</p>
          {PROVIDERS.map((provider) => {
            const keyField = `${provider.name}_api_key` as keyof SettingsForm;
            return (
              <div key={provider.name} className="mb-4">
                <label className="block text-sm text-[--dim] mb-1">{provider.displayName}</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={form[keyField]}
                    onChange={(e) => setForm({ ...form, [keyField]: e.target.value })}
                    placeholder={`${provider.displayName} API key`}
                    className="flex-1"
                  />
                  <button
                    onClick={() => handleTest(provider.name)}
                    disabled={testing === provider.name}
                    className="px-3 py-1 border border-[--dim] text-sm hover:border-[--green] disabled:opacity-50"
                  >
                    {testing === provider.name ? '...' : 'test'}
                  </button>
                </div>
                {testResults[provider.name] !== undefined && testResults[provider.name] !== null && (
                  <p className={`text-sm mt-1 ${testResults[provider.name] ? 'text-[--green]' : 'text-[--red]'}`}>
                    {testResults[provider.name] ? 'Connection ok' : 'Connection failed'}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2 border border-[--green] hover:bg-[--green] hover:text-[--bg] disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
