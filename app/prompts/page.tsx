'use client';

import { useEffect, useState } from 'react';
import { Prompt, CollectionWithPrompts } from '@/lib/types';

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [collections, setCollections] = useState<CollectionWithPrompts[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', content: '', category: '', collectionId: '' });
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [newCollection, setNewCollection] = useState('');
  const [showNewCollectionInput, setShowNewCollectionInput] = useState(false);

  const loadData = async () => {
    const [promptsRes, collectionsRes] = await Promise.all([
      fetch('/api/prompts').then((r) => r.json()),
      fetch('/api/collections').then((r) => r.json()),
    ]);
    setPrompts(Array.isArray(promptsRes) ? promptsRes : []);
    setCollections(Array.isArray(collectionsRes) ? collectionsRes : []);
    setLoading(false);
  };

  const loadPrompts = loadData;

  useEffect(() => {
    const run = async () => {
      await loadData();
    };
    run();
  }, []);

  const handleCreate = async () => {
    if (!form.name || !form.content) return;
    setSaving(true);
    try {
      const response = await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, content: form.content, category: form.category }),
      });
      if (response.ok) {
        const newPrompt = await response.json();
        // Add to collection if selected
        if (form.collectionId) {
          const collection = collections.find((c) => c.id === Number(form.collectionId));
          if (collection) {
            await fetch('/api/collections', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: collection.id,
                prompt_ids: [...collection.prompt_ids, newPrompt.id],
              }),
            });
          }
        }
        setForm({ name: '', content: '', category: '', collectionId: '' });
        setShowForm(false);
        loadData();
      }
    } catch (error) {
      console.error('Failed to create prompt:', error);
    }
    setSaving(false);
  };

  const handleCreateCollection = async () => {
    if (!newCollection.trim()) return;
    try {
      const response = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCollection.trim() }),
      });
      if (response.ok) {
        const created = await response.json();
        setForm({ ...form, collectionId: String(created.id) });
        setShowNewCollectionInput(false);
      }
      setNewCollection('');
      loadData();
    } catch (error) {
      console.error('Failed to create collection:', error);
    }
  };

  const handleDeleteCollection = async (id: number) => {
    if (!confirm('Delete this collection?')) return;
    try {
      await fetch(`/api/collections?id=${id}`, { method: 'DELETE' });
      loadData();
    } catch (error) {
      console.error('Failed to delete collection:', error);
    }
  };

  const handleGenerate = async () => {
    if (!form.name) return;
    setGenerating(true);
    try {
      const response = await fetch('/api/prompts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: form.name, category: form.category }),
      });
      if (response.ok) {
        const data = await response.json();
        setForm({ ...form, content: data.prompt });
      }
    } catch (error) {
      console.error('Failed to generate prompt:', error);
    }
    setGenerating(false);
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

  const getCollectionsForPrompt = (promptId: number) => {
    return collections.filter((c) => c.prompt_ids.includes(promptId));
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
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm text-[--dim]">Content</label>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating || !form.name}
                className="text-xs text-[--dim] hover:text-[--green] disabled:opacity-50 cursor-pointer"
              >
                {generating ? 'generating...' : 'generate with AI'}
              </button>
            </div>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="Prompt content"
              rows={3}
              className="w-full resize-none"
            />
          </div>
          <input
            type="text"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            placeholder="Category (optional)"
            className="w-full"
          />
          <div>
            <label className="text-sm text-[--dim] block mb-2">Collection</label>
            <div className="flex flex-wrap gap-2">
              {collections.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setForm({ ...form, collectionId: form.collectionId === String(c.id) ? '' : String(c.id) })}
                  className="px-2 py-1 text-xs border cursor-pointer"
                  style={{
                    borderColor: form.collectionId === String(c.id) ? 'var(--amber)' : 'var(--dim)',
                    color: form.collectionId === String(c.id) ? 'var(--bg)' : 'var(--dim)',
                    backgroundColor: form.collectionId === String(c.id) ? 'var(--amber)' : 'transparent',
                  }}
                >
                  {c.name}
                </button>
              ))}
              {showNewCollectionInput ? (
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={newCollection}
                    onChange={(e) => setNewCollection(e.target.value)}
                    placeholder="name"
                    className="w-24 px-2 py-1 text-xs"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newCollection.trim()) {
                        handleCreateCollection();
                      } else if (e.key === 'Escape') {
                        setShowNewCollectionInput(false);
                        setNewCollection('');
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newCollection.trim()) handleCreateCollection();
                    }}
                    className="px-2 py-1 text-xs border border-[--green] text-[--green] cursor-pointer"
                  >
                    ok
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewCollectionInput(false);
                      setNewCollection('');
                    }}
                    className="px-2 py-1 text-xs border border-[--dim] text-[--dim] cursor-pointer"
                  >
                    x
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowNewCollectionInput(true)}
                  className="px-2 py-1 text-xs border border-[--dim] text-[--dim] hover:border-[--amber] hover:text-[--amber] cursor-pointer"
                >
                  + new
                </button>
              )}
            </div>
          </div>
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
                <div className="flex items-center gap-2 flex-wrap">
                  <span>{prompt.name}</span>
                  {prompt.category && (
                    <span className="text-xs text-[--cyan]">{prompt.category}</span>
                  )}
                  {getCollectionsForPrompt(prompt.id).map((c) => (
                    <span key={c.id} className="text-xs text-[--amber]">[{c.name}]</span>
                  ))}
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

      <div className="border-t border-[--dim] pt-6">
        <h2 className="text-sm text-[--dim] mb-3">Collections</h2>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newCollection}
            onChange={(e) => setNewCollection(e.target.value)}
            placeholder="New collection name"
            className="flex-1"
            onKeyDown={(e) => e.key === 'Enter' && handleCreateCollection()}
          />
          <button
            onClick={handleCreateCollection}
            disabled={!newCollection.trim()}
            className="px-3 py-1 border border-[--dim] text-sm hover:border-[--green] disabled:opacity-50"
          >
            + add
          </button>
        </div>
        {collections.length === 0 ? (
          <p className="text-[--dim] text-sm">No collections yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {collections.map((c) => (
              <div key={c.id} className="flex items-center gap-1 px-2 py-1 border border-[--dim] text-sm">
                <span className="text-[--amber]">{c.name}</span>
                <span className="text-[--dim]">({c.prompt_ids.length})</span>
                <button
                  onClick={() => handleDeleteCollection(c.id)}
                  className="text-[--red] hover:underline ml-1"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
