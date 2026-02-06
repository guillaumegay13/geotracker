'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RunWithPrompt } from '@/lib/types';

const HISTORY_PAGE_SIZE = 50;

export default function HistoryPage() {
  const [runs, setRuns] = useState<RunWithPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE_SIZE);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [historyQuery, setHistoryQuery] = useState('');
  const [expandedRun, setExpandedRun] = useState<number | null>(null);
  const [runDetails, setRunDetails] = useState<Record<number, RunWithPrompt>>({});
  const [loadingRunDetails, setLoadingRunDetails] = useState<Record<number, boolean>>({});

  const loadData = useCallback(async () => {
    const response = await fetch(`/api/runs?limit=${historyLimit}`);
    const data = await response.json();
    const parsedRuns = Array.isArray(data) ? data : [];
    setRuns(parsedRuns);
    setHasMoreHistory(parsedRuns.length === historyLimit);
    setLoading(false);
  }, [historyLimit]);

  useEffect(() => {
    const run = async () => {
      await loadData();
    };
    run();
  }, [loadData]);

  const handleExpandRun = async (runId: number) => {
    if (expandedRun === runId) {
      setExpandedRun(null);
      return;
    }

    setExpandedRun(runId);

    if (runDetails[runId] || loadingRunDetails[runId]) return;

    setLoadingRunDetails((prev) => ({ ...prev, [runId]: true }));
    try {
      const response = await fetch(`/api/runs?id=${runId}&include_response=1`);
      if (response.ok) {
        const detail = (await response.json()) as RunWithPrompt;
        setRunDetails((prev) => ({ ...prev, [runId]: detail }));
      }
    } catch (error) {
      console.error('Failed to load run details:', error);
    } finally {
      setLoadingRunDetails((prev) => ({ ...prev, [runId]: false }));
    }
  };

  const filteredRuns = useMemo(() => {
    const query = historyQuery.trim().toLowerCase();
    if (!query) return runs;

    return runs.filter((run) => {
      const detail = runDetails[run.id];
      const source = [
        run.prompt_name,
        run.provider,
        run.model,
        run.response,
        ...(run.signals.urls || []),
        ...(run.signals.context || []),
        detail?.prompt_content || '',
        detail?.response || '',
      ]
        .join(' ')
        .toLowerCase();

      return source.includes(query);
    });
  }, [historyQuery, runDetails, runs]);

  if (loading) {
    return <div className="text-[--dim]">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg">History</h1>

      <div className="flex items-center justify-between gap-3">
        <input
          type="text"
          value={historyQuery}
          onChange={(e) => setHistoryQuery(e.target.value)}
          placeholder="Search history..."
          className="w-80 max-w-full"
        />
        <p className="text-xs text-[--dim]">{runs.length} loaded</p>
      </div>

      {filteredRuns.length === 0 ? (
        <p className="text-[--dim] text-sm">{runs.length === 0 ? 'No runs yet.' : 'No runs match your search.'}</p>
      ) : (
        <div className="space-y-2">
          {filteredRuns.map((run) => (
            <div key={run.id} className="border border-[--dim]">
              <div
                className="p-3 cursor-pointer flex justify-between items-center"
                onClick={() => handleExpandRun(run.id)}
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
                  {loadingRunDetails[run.id] && (
                    <p className="text-[--dim]">Loading full response...</p>
                  )}
                  <div>
                    <span className="text-[--dim]">prompt:</span>
                    <pre className="mt-1 text-[--dim] whitespace-pre-wrap">
                      {(runDetails[run.id] || run).prompt_content || '-'}
                    </pre>
                  </div>
                  <div>
                    <span className="text-[--dim]">response:</span>
                    <pre className="mt-1 whitespace-pre-wrap max-h-48 overflow-y-auto">
                      {(runDetails[run.id] || run).response}
                      {!runDetails[run.id] && !loadingRunDetails[run.id] && run.response.length > 0 && '\n\n[preview only]'}
                    </pre>
                  </div>
                  {(runDetails[run.id] || run).signals.context.length > 0 && (
                    <div>
                      <span className="text-[--dim]">context:</span>
                      {(runDetails[run.id] || run).signals.context.map((ctx, i) => (
                        <p key={i} className="mt-1 text-[--amber]">{ctx}</p>
                      ))}
                    </div>
                  )}
                  {(runDetails[run.id] || run).signals.urls.length > 0 && (
                    <div>
                      <span className="text-[--dim]">urls:</span>
                      {(runDetails[run.id] || run).signals.urls.map((url, i) => (
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

      {hasMoreHistory && (
        <button
          type="button"
          onClick={() => setHistoryLimit((prev) => prev + HISTORY_PAGE_SIZE)}
          className="px-3 py-1 border border-[--dim] text-sm hover:border-[--green] hover:text-[--green] cursor-pointer"
        >
          Load more history
        </button>
      )}
    </div>
  );
}
