'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RunWithPrompt, Settings } from '@/lib/types';

const DASHBOARD_RUN_LIMIT = 100;

export default function Dashboard() {
  const [runs, setRuns] = useState<RunWithPrompt[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/runs?limit=${DASHBOARD_RUN_LIMIT}`).then((r) => r.json()),
      fetch('/api/settings').then((r) => r.json()),
    ]).then(([runsData, settingsData]) => {
      setRuns(runsData);
      setSettings(settingsData);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="text-[--dim]">Loading...</div>;
  }

  const totalRuns = runs.length;
  const mentionedRuns = runs.filter((r) => r.signals.mentioned).length;
  const citedRuns = runs.filter((r) => r.signals.cited).length;
  const mentionRate = totalRuns > 0 ? ((mentionedRuns / totalRuns) * 100).toFixed(1) : '0';
  const citationRate = totalRuns > 0 ? ((citedRuns / totalRuns) * 100).toFixed(1) : '0';

  const byProvider = runs.reduce(
    (acc, run) => {
      if (!acc[run.provider]) {
        acc[run.provider] = { total: 0, mentioned: 0, cited: 0 };
      }
      acc[run.provider].total++;
      if (run.signals.mentioned) acc[run.provider].mentioned++;
      if (run.signals.cited) acc[run.provider].cited++;
      return acc;
    },
    {} as Record<string, { total: number; mentioned: number; cited: number }>
  );

  const recentRuns = runs.slice(0, 5);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg mb-2">Dashboard</h1>
        {settings?.tracked_domain ? (
          <p className="text-sm text-[--dim]">Tracking: {settings.tracked_domain}</p>
        ) : (
          <p className="text-sm text-[--amber]">
            No domain set. <Link href="/settings">Configure settings</Link>
          </p>
        )}
      </div>

      <div className="grid grid-cols-4 gap-4 text-sm">
        <div className="border border-[--dim] p-3">
          <div className="text-[--dim]">Runs</div>
          <div className="text-xl">{totalRuns}</div>
        </div>
        <div className="border border-[--dim] p-3">
          <div className="text-[--dim]">Mentions</div>
          <div className="text-xl">{mentionedRuns} <span className="text-sm text-[--dim]">({mentionRate}%)</span></div>
        </div>
        <div className="border border-[--dim] p-3">
          <div className="text-[--dim]">Citations</div>
          <div className="text-xl">{citedRuns} <span className="text-sm text-[--dim]">({citationRate}%)</span></div>
        </div>
        <div className="border border-[--dim] p-3">
          <div className="text-[--dim]">Providers</div>
          <div className="text-xl">{Object.keys(byProvider).length}</div>
        </div>
      </div>

      {Object.keys(byProvider).length > 0 && (
        <div>
          <h2 className="text-sm text-[--dim] mb-3">By Provider</h2>
          <div className="grid grid-cols-3 gap-4 text-sm">
            {Object.entries(byProvider).map(([provider, stats]) => (
              <div key={provider} className="border border-[--dim] p-3">
                <div className="text-[--cyan] mb-2">{provider}</div>
                <div className="space-y-1 text-[--dim]">
                  <div className="flex justify-between"><span>runs</span><span className="text-[--green]">{stats.total}</span></div>
                  <div className="flex justify-between"><span>mention</span><span className="text-[--green]">{((stats.mentioned / stats.total) * 100).toFixed(0)}%</span></div>
                  <div className="flex justify-between"><span>cited</span><span className="text-[--green]">{((stats.cited / stats.total) * 100).toFixed(0)}%</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-sm text-[--dim]">Recent Runs</h2>
          <Link href="/history" className="text-sm">view all</Link>
        </div>
        {recentRuns.length === 0 ? (
          <p className="text-[--dim] text-sm">No runs yet. <Link href="/runs">Execute a run</Link></p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[--dim] text-left">
                <th className="pb-2">prompt</th>
                <th className="pb-2">provider</th>
                <th className="pb-2">model</th>
                <th className="pb-2 text-center">mentioned</th>
                <th className="pb-2 text-center">cited</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((run) => (
                <tr key={run.id} className="border-t border-[--dim]">
                  <td className="py-2">{run.prompt_name}</td>
                  <td className="py-2 text-[--cyan]">{run.provider}</td>
                  <td className="py-2 text-[--dim]">{run.model}</td>
                  <td className="py-2 text-center">{run.signals.mentioned ? 'yes' : '-'}</td>
                  <td className="py-2 text-center">{run.signals.cited ? 'yes' : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
