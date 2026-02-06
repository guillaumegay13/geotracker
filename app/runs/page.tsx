'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Prompt, RunWithPrompt, PROVIDERS, Provider, CollectionWithPrompts } from '@/lib/types';

function getRunStage(progress: number): string {
  if (progress < 14) return 'preparing run matrix';
  if (progress < 36) return 'sending prompts to providers';
  if (progress < 62) return 'collecting responses';
  if (progress < 86) return 'extracting mention and citation signals';
  if (progress < 100) return 'saving run history';
  return 'done';
}

export default function RunsPage() {
  const searchParams = useSearchParams();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [collections, setCollections] = useState<CollectionWithPrompts[]>([]);
  const [runs, setRuns] = useState<RunWithPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [runProgress, setRunProgress] = useState(0);
  const [runJobCount, setRunJobCount] = useState(0);
  const [selectedPrompts, setSelectedPrompts] = useState<number[]>([]);
  const [selectedProviders, setSelectedProviders] = useState<{ provider: Provider; model: string }[]>([]);
  const [expandedRun, setExpandedRun] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    const [promptsRes, collectionsRes, runsRes] = await Promise.all([
      fetch('/api/prompts').then((r) => r.json()),
      fetch('/api/collections').then((r) => r.json()),
      fetch('/api/runs').then((r) => r.json()),
    ]);

    const parsedPrompts = Array.isArray(promptsRes) ? promptsRes : [];
    const parsedCollections = Array.isArray(collectionsRes) ? collectionsRes : [];
    setPrompts(parsedPrompts);
    setCollections(parsedCollections);
    setRuns(Array.isArray(runsRes) ? runsRes : []);

    const collectionParam = searchParams.get('collection');
    if (collectionParam) {
      const collectionId = Number(collectionParam);
      if (!Number.isNaN(collectionId)) {
        const collection = parsedCollections.find((item: CollectionWithPrompts) => item.id === collectionId);
        if (collection) setSelectedPrompts(collection.prompt_ids);
      }
    }

    setLoading(false);
  }, [searchParams]);

  useEffect(() => {
    const run = async () => {
      await loadData();
    };
    run();
  }, [loadData]);

  useEffect(() => {
    if (!executing) return;

    const interval = setInterval(() => {
      setRunProgress((prev) => {
        if (prev >= 94) return prev;
        const step = prev < 34 ? 4 : prev < 68 ? 3 : 2;
        return Math.min(94, prev + step);
      });
    }, 280);

    return () => clearInterval(interval);
  }, [executing]);

  const togglePrompt = (promptId: number) => {
    if (selectedPrompts.includes(promptId)) {
      setSelectedPrompts(selectedPrompts.filter((id) => id !== promptId));
    } else {
      setSelectedPrompts([...selectedPrompts, promptId]);
    }
  };

  const toggleAllPrompts = () => {
    if (selectedPrompts.length === prompts.length) {
      setSelectedPrompts([]);
    } else {
      setSelectedPrompts(prompts.map((p) => p.id));
    }
  };

  const selectCollection = (collection: CollectionWithPrompts) => {
    setSelectedPrompts(collection.prompt_ids);
  };

  const toggleProvider = (provider: Provider, model: string) => {
    const exists = selectedProviders.find((p) => p.provider === provider && p.model === model);
    if (exists) {
      setSelectedProviders(selectedProviders.filter((p) => !(p.provider === provider && p.model === model)));
    } else {
      setSelectedProviders([...selectedProviders, { provider, model }]);
    }
  };

  const allModels = PROVIDERS.flatMap((p) => p.models.map((m) => ({ provider: p.name, model: m })));

  const toggleAllModels = () => {
    if (selectedProviders.length === allModels.length) {
      setSelectedProviders([]);
    } else {
      setSelectedProviders(allModels);
    }
  };

  const handleExecute = async () => {
    if (selectedPrompts.length === 0 || selectedProviders.length === 0) return;
    setRunJobCount(selectedPrompts.length * selectedProviders.length);
    setRunProgress(3);
    setExecuting(true);
    try {
      const response = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt_ids: selectedPrompts,
          providers: selectedProviders,
        }),
      });
      if (response.ok) {
        setSelectedPrompts([]);
        setSelectedProviders([]);
        loadData();
      }
    } catch (error) {
      console.error('Failed to execute run:', error);
    } finally {
      setRunProgress(100);
      await new Promise((resolve) => setTimeout(resolve, 220));
      setExecuting(false);
      setRunProgress(0);
    }
  };

  if (loading) {
    return <div className="text-[--dim]">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg">Runs</h1>

      <div className="border border-[--dim] p-4 space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-[--dim]">Prompts</label>
            <button
              type="button"
              onClick={toggleAllPrompts}
              className="text-xs text-[--dim] hover:text-[--green] cursor-pointer"
            >
              {selectedPrompts.length === prompts.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          {collections.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {collections.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => selectCollection(c)}
                  className="px-2 py-0.5 text-xs border border-[--amber] text-[--amber] hover:bg-[--amber] hover:text-[--bg] cursor-pointer"
                >
                  {c.name} ({c.prompt_ids.length})
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {prompts.map((prompt) => {
              const isSelected = selectedPrompts.includes(prompt.id);
              return (
                <button
                  type="button"
                  key={prompt.id}
                  onClick={() => togglePrompt(prompt.id)}
                  className="px-2 py-1 text-xs border cursor-pointer"
                  style={{
                    borderColor: isSelected ? 'var(--green)' : 'var(--dim)',
                    color: isSelected ? 'var(--bg)' : 'var(--dim)',
                    backgroundColor: isSelected ? 'var(--green)' : 'transparent',
                  }}
                >
                  {prompt.name}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-[--dim]">Models</label>
            <button
              type="button"
              onClick={toggleAllModels}
              className="text-xs text-[--dim] hover:text-[--green] cursor-pointer"
            >
              {selectedProviders.length === allModels.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
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
                      type="button"
                      key={model}
                      onClick={() => toggleProvider(provider.name, model)}
                      className="px-2 py-1 text-xs border cursor-pointer"
                      style={{
                        borderColor: isSelected ? 'var(--green)' : 'var(--dim)',
                        color: isSelected ? 'var(--bg)' : 'var(--dim)',
                        backgroundColor: isSelected ? 'var(--green)' : 'transparent',
                      }}
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
          type="button"
          onClick={handleExecute}
          disabled={executing || selectedPrompts.length === 0 || selectedProviders.length === 0}
          className="px-4 py-1 border border-[--green] hover:bg-[--green] hover:text-[--bg] disabled:opacity-50 cursor-pointer"
        >
          {executing ? 'Running...' : 'Run'}
        </button>
        {executing && (
          <div className="border border-[--dim] px-3 py-2 space-y-2">
            <p className="text-xs text-[--dim]">
              {getRunStage(runProgress)} ({runJobCount} calls)
            </p>
            <div className="w-full h-3 border border-[--dim] p-[1px]">
              <div
                className="h-full transition-all duration-200 ease-linear"
                style={{
                  width: `${Math.max(2, Math.round(runProgress))}%`,
                  backgroundColor: 'var(--green)',
                }}
              />
            </div>
            <p className="text-xs text-[--green] text-right">{Math.round(runProgress)}%</p>
          </div>
        )}
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
