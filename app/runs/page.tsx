'use client';

import { useEffect, useState } from 'react';
import { Prompt, RunWithPrompt, PROVIDERS, Provider } from '@/lib/types';

export default function RunsPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [runs, setRuns] = useState<RunWithPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState<number | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<{ provider: Provider; model: string }[]>([]);
  const [expandedRun, setExpandedRun] = useState<number | null>(null);

  const loadData = async () => {
    const [promptsRes, runsRes] = await Promise.all([
      fetch('/api/prompts').then((r) => r.json()),
      fetch('/api/runs').then((r) => r.json()),
    ]);
    setPrompts(promptsRes);
    setRuns(runsRes);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const toggleProvider = (provider: Provider, model: string) => {
    const exists = selectedProviders.find((p) => p.provider === provider && p.model === model);
    if (exists) {
      setSelectedProviders(selectedProviders.filter((p) => !(p.provider === provider && p.model === model)));
    } else {
      setSelectedProviders([...selectedProviders, { provider, model }]);
    }
  };

  const handleExecute = async () => {
    if (!selectedPrompt || selectedProviders.length === 0) return;
    setExecuting(true);
    try {
      const response = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt_id: selectedPrompt,
          providers: selectedProviders,
        }),
      });
      if (response.ok) {
        setSelectedPrompt(null);
        setSelectedProviders([]);
        loadData();
      }
    } catch (error) {
      console.error('Failed to execute run:', error);
    }
    setExecuting(false);
  };

  if (loading) {
    return <div className="text-[--dim]">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg">Runs</h1>

      <div className="border border-[--dim] p-4 space-y-4">
        <div>
          <label className="block text-sm text-[--dim] mb-1">Prompt</label>
          <select
            value={selectedPrompt || ''}
            onChange={(e) => setSelectedPrompt(e.target.value ? Number(e.target.value) : null)}
            className="w-full"
          >
            <option value="">Select prompt...</option>
            {prompts.map((prompt) => (
              <option key={prompt.id} value={prompt.id}>{prompt.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-[--dim] mb-2">Models</label>
          {PROVIDERS.map((provider) => (
            <div key={provider.name} className="mb-3">
              <span className="text-sm text-[--cyan]">{provider.displayName}</span>
              <div className="flex flex-wrap gap-2 mt-1">
                {provider.models.map((model) => {
                  const isSelected = selectedProviders.some(
                    (p) => p.provider === provider.name && p.model === model
                  );
                  return (
                    <button
                      key={model}
                      onClick={() => toggleProvider(provider.name, model)}
                      className={`px-2 py-1 text-xs border ${
                        isSelected
                          ? 'border-[--green] text-[--green]'
                          : 'border-[--dim] text-[--dim] hover:border-[--green]'
                      }`}
                    >
                      {model}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleExecute}
          disabled={executing || !selectedPrompt || selectedProviders.length === 0}
          className="px-4 py-1 border border-[--green] hover:bg-[--green] hover:text-[--bg] disabled:opacity-50"
        >
          {executing ? 'Running...' : 'Run'}
        </button>
      </div>

      <div>
        <h2 className="text-sm text-[--dim] mb-3">History</h2>
        {runs.length === 0 ? (
          <p className="text-[--dim] text-sm">No runs yet.</p>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <div key={run.id} className="border border-[--dim]">
                <div
                  className="p-3 cursor-pointer flex justify-between items-center"
                  onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                >
                  <div>
                    <span>{run.prompt_name}</span>
                    <span className="text-[--dim] text-sm ml-2">{run.provider}/{run.model}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    {run.signals.mentioned && <span className="text-[--green]">mentioned</span>}
                    {run.signals.cited && <span className="text-[--cyan]">cited</span>}
                    {!run.signals.mentioned && !run.signals.cited && <span className="text-[--dim]">-</span>}
                  </div>
                </div>

                {expandedRun === run.id && (
                  <div className="border-t border-[--dim] p-3 space-y-3 text-sm">
                    <div>
                      <span className="text-[--dim]">prompt:</span>
                      <pre className="mt-1 text-[--dim] whitespace-pre-wrap">{run.prompt_content}</pre>
                    </div>
                    <div>
                      <span className="text-[--dim]">response:</span>
                      <pre className="mt-1 whitespace-pre-wrap max-h-48 overflow-y-auto">{run.response}</pre>
                    </div>
                    {run.signals.context.length > 0 && (
                      <div>
                        <span className="text-[--dim]">context:</span>
                        {run.signals.context.map((ctx, i) => (
                          <p key={i} className="mt-1 text-[--amber]">{ctx}</p>
                        ))}
                      </div>
                    )}
                    {run.signals.urls.length > 0 && (
                      <div>
                        <span className="text-[--dim]">urls:</span>
                        {run.signals.urls.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block mt-1 break-all">
                            {url}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
