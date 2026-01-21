'use client';

import { useEffect, useState } from 'react';
import { Prompt } from '@/lib/types';

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', content: '', category: '' });
  const [saving, setSaving] = useState(false);

  const loadPrompts = async () => {
    const response = await fetch('/api/prompts');
    const data = await response.json();
    setPrompts(data);
    setLoading(false);
  };

  useEffect(() => {
    loadPrompts();
  }, []);

  const handleCreate = async () => {
    if (!form.name || !form.content) return;
    setSaving(true);
    try {
      const response = await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (response.ok) {
        setForm({ name: '', content: '', category: '' });
        setShowForm(false);
        loadPrompts();
      }
    } catch (error) {
      console.error('Failed to create prompt:', error);
    }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this prompt?')) return;
    try {
      await fetch(`/api/prompts?id=${id}`, { method: 'DELETE' });
      loadPrompts();
    } catch (error) {
      console.error('Failed to delete prompt:', error);
    }
  };

  if (loading) {
    return <div className="text-[--dim]">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-lg">Prompts</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1 border border-[--dim] text-sm hover:border-[--green]"
        >
          {showForm ? 'cancel' : '+ add'}
        </button>
      </div>

      {showForm && (
        <div className="border border-[--dim] p-4 space-y-3">
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Name"
            className="w-full"
          />
          <textarea
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            placeholder="Prompt content"
            rows={3}
            className="w-full resize-none"
          />
          <input
            type="text"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            placeholder="Category (optional)"
            className="w-full"
          />
          <button
            onClick={handleCreate}
            disabled={saving || !form.name || !form.content}
            className="px-4 py-1 border border-[--green] hover:bg-[--green] hover:text-[--bg] disabled:opacity-50"
          >
            {saving ? '...' : 'create'}
          </button>
        </div>
      )}

      {prompts.length === 0 ? (
        <p className="text-[--dim] text-sm">No prompts yet.</p>
      ) : (
        <div className="space-y-2">
          {prompts.map((prompt) => (
            <div key={prompt.id} className="border border-[--dim] p-3 flex justify-between items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span>{prompt.name}</span>
                  {prompt.category && (
                    <span className="text-xs text-[--cyan]">{prompt.category}</span>
                  )}
                </div>
                <p className="text-sm text-[--dim] truncate mt-1">{prompt.content}</p>
              </div>
              <button
                onClick={() => handleDelete(prompt.id)}
                className="text-sm text-[--red] hover:underline"
              >
                del
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
