'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CollectionWithPrompts, Prompt, PROVIDERS, Provider } from '@/lib/types';

const PROMPT_LIST_LIMIT = 200;

function getRunStage(progress: number): string {
  if (progress < 14) return 'preparing run matrix';
  if (progress < 36) return 'sending prompts to providers';
  if (progress < 62) return 'collecting responses';
  if (progress < 86) return 'extracting mention and citation signals';
  if (progress < 100) return 'saving run history';
  return 'done';
}

function uniq(values: number[]): number[] {
  return Array.from(new Set(values));
}

export default function RunsPage() {
  const searchParams = useSearchParams();
  const collectionPrefilledRef = useRef(false);

  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [collections, setCollections] = useState<CollectionWithPrompts[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [runProgress, setRunProgress] = useState(0);
  const [runJobCount, setRunJobCount] = useState(0);
  const [promptQuery, setPromptQuery] = useState('');
  const [selectedPrompts, setSelectedPrompts] = useState<number[]>([]);
  const [selectedProviders, setSelectedProviders] = useState<{ provider: Provider; model: string }[]>([]);

  const loadData = useCallback(async () => {
    const [promptsRes, collectionsRes] = await Promise.all([
      fetch(`/api/prompts?limit=${PROMPT_LIST_LIMIT}`).then((r) => r.json()),
      fetch('/api/collections').then((r) => r.json()),
    ]);

    const parsedPrompts = Array.isArray(promptsRes) ? promptsRes : [];
    const parsedCollections = Array.isArray(collectionsRes) ? collectionsRes : [];

    setPrompts(parsedPrompts);
    setCollections(parsedCollections);

    const collectionParam = searchParams.get('collection');
    if (collectionParam && !collectionPrefilledRef.current) {
      const collectionId = Number(collectionParam);
      if (!Number.isNaN(collectionId)) {
        const collection = parsedCollections.find((item: CollectionWithPrompts) => item.id === collectionId);
        if (collection) {
          setSelectedPrompts(collection.prompt_ids);
          collectionPrefilledRef.current = true;
        }
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

  const filteredPrompts = useMemo(() => {
    const query = promptQuery.trim().toLowerCase();
    if (!query) return prompts;

    return prompts.filter((prompt) => {
      const source = `${prompt.name} ${prompt.content} ${prompt.category || ''}`.toLowerCase();
      return source.includes(query);
    });
  }, [promptQuery, prompts]);

  const allModels = PROVIDERS.flatMap((provider) =>
    provider.models.map((model) => ({ provider: provider.name, model }))
  );

  const togglePrompt = (promptId: number) => {
    if (selectedPrompts.includes(promptId)) {
      setSelectedPrompts(selectedPrompts.filter((id) => id !== promptId));
    } else {
      setSelectedPrompts([...selectedPrompts, promptId]);
    }
  };

  const selectCollection = (collection: CollectionWithPrompts) => {
    setSelectedPrompts(collection.prompt_ids);
  };

  const selectVisiblePrompts = () => {
    setSelectedPrompts((prev) => uniq([...prev, ...filteredPrompts.map((prompt) => prompt.id)]));
  };

  const clearVisiblePrompts = () => {
    const visibleIds = new Set(filteredPrompts.map((prompt) => prompt.id));
    setSelectedPrompts((prev) => prev.filter((id) => !visibleIds.has(id)));
  };

  const toggleProvider = (provider: Provider, model: string) => {
    const exists = selectedProviders.find((item) => item.provider === provider && item.model === model);
    if (exists) {
      setSelectedProviders(selectedProviders.filter((item) => !(item.provider === provider && item.model === model)));
    } else {
      setSelectedProviders([...selectedProviders, { provider, model }]);
    }
  };

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
      <h1 className="text-lg">Run</h1>

      <div className="border border-[--dim] p-4 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm text-[--dim]">Prompts</label>
            <span className="text-xs text-[--dim]">{selectedPrompts.length} selected</span>
          </div>

          <input
            type="text"
            value={promptQuery}
            onChange={(e) => setPromptQuery(e.target.value)}
            placeholder="Search prompts..."
            className="w-full"
          />

          {collections.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {collections.map((collection) => (
                <button
                  type="button"
                  key={collection.id}
                  onClick={() => selectCollection(collection)}
                  className="px-2 py-0.5 text-xs border border-[--amber] text-[--amber] hover:bg-[--amber] hover:text-[--bg] cursor-pointer"
                >
                  {collection.name} ({collection.prompt_ids.length})
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectVisiblePrompts}
              className="px-2 py-1 text-xs border border-[--dim] hover:border-[--green] cursor-pointer"
            >
              Select visible
            </button>
            <button
              type="button"
              onClick={clearVisiblePrompts}
              className="px-2 py-1 text-xs border border-[--dim] hover:border-[--amber] cursor-pointer"
            >
              Clear visible
            </button>
            <p className="text-xs text-[--dim]">
              Showing {filteredPrompts.length} / {prompts.length} (latest {PROMPT_LIST_LIMIT})
            </p>
          </div>

          <div className="border border-[--dim] max-h-72 overflow-y-auto p-2 space-y-1">
            {filteredPrompts.length === 0 ? (
              <p className="text-xs text-[--dim] px-1 py-2">No prompts match your search.</p>
            ) : (
              filteredPrompts.map((prompt) => {
                const isSelected = selectedPrompts.includes(prompt.id);
                return (
                  <button
                    type="button"
                    key={prompt.id}
                    onClick={() => togglePrompt(prompt.id)}
                    className="w-full text-left px-2 py-1 border cursor-pointer"
                    style={{
                      borderColor: isSelected ? 'var(--green)' : 'var(--dim)',
                      color: isSelected ? 'var(--bg)' : 'var(--green)',
                      backgroundColor: isSelected ? 'var(--green)' : 'transparent',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs">{prompt.name}</span>
                      {prompt.category && (
                        <span className="text-[10px]" style={{ color: isSelected ? 'var(--bg)' : 'var(--cyan)' }}>
                          {prompt.category}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] truncate" style={{ color: isSelected ? 'var(--bg)' : 'var(--dim)' }}>
                      {prompt.content}
                    </p>
                  </button>
                );
              })
            )}
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
                    (item) => item.provider === provider.name && item.model === model
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
    </div>
  );
}
