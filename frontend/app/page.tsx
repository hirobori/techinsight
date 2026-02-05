'use client';

import { useEffect, useMemo, useState } from 'react';

type Article = {
  id: number;
  title: string;
  content: string;
  author?: string | null;
  category?: string | null;
  published_at?: string | null;
};

type SearchHit = {
  score?: number;
  distance?: number;
  article: Article;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000';

function formatDate(s?: string | null) {
  if (!s) return '';
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = 10000;
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const body = await safeJson(res);
      throw new Error(typeof body === 'string' ? body : JSON.stringify(body));
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function Notice(props: { kind: 'info' | 'error'; children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: 10,
        borderRadius: 10,
        border: '1px solid',
        borderColor: props.kind === 'error' ? '#f5b5b5' : '#cfe5ff',
        background: props.kind === 'error' ? '#fff5f5' : '#f5faff',
        color: '#111', // ← 常に黒
        whiteSpace: 'pre-wrap',
      }}
    >
      {props.children}
    </div>
  );
}

function Modal(props: {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!props.open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [props.open, props.onClose]);

  if (!props.open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={props.onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 9999,
        color: '#111', // ← 黒を強制
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: 'min(860px, 100%)',
          maxHeight: '85vh',
          overflow: 'auto',
          background: '#fff',
          color: '#111',
          borderRadius: 12,
          padding: 16,
          border: '1px solid #e5e5e5',
          boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#111' }}>
          <div style={{ fontWeight: 900, fontSize: 18, color: '#111' }}>{props.title ?? ''}</div>
          <div style={{ flex: 1 }} />
          <button
            onClick={props.onClose}
            style={{
              padding: '6px 10px',
              color: '#111', // ← ボタン文字も黒
            }}
          >
            × Close
          </button>
        </div>
        <div style={{ marginTop: 12, color: '#111' }}>{props.children}</div>
      </div>
    </div>
  );
}

function ArticleForm(props: {
  mode: 'create' | 'edit';
  initial?: Partial<Article>;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState(props.initial?.title ?? '');
  const [content, setContent] = useState(props.initial?.content ?? '');
  const [author, setAuthor] = useState(props.initial?.author ?? '');
  const [category, setCategory] = useState(props.initial?.category ?? '');
  const [publishedAt, setPublishedAt] = useState(props.initial?.published_at ?? '');

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    setSaving(true);
    try {
      const payload = {
        title,
        content,
        author: author || null,
        category: category || null,
        published_at: publishedAt || null,
      };

      if (props.mode === 'create') {
        await api<Article>(`/articles`, { method: 'POST', body: JSON.stringify(payload) });
      } else {
        const id = props.initial?.id;
        if (!id) throw new Error('Missing id');
        await api<Article>(`/articles/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      }

      await props.onSaved();
    } catch (e: unknown) {
      setErr(toErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 10, color: '#111' }}>
      <div style={{ display: 'grid', gap: 6 }}>
        <label style={{ fontSize: 13, color: '#111' }}>Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ padding: 10, border: '1px solid #ddd', borderRadius: 8, color: '#111' }}
        />
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <label style={{ fontSize: 13, color: '#111' }}>Content</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={10}
          style={{ padding: 10, border: '1px solid #ddd', borderRadius: 8, color: '#111' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontSize: 13, color: '#111' }}>Author</label>
          <input
            value={author ?? ''}
            onChange={(e) => setAuthor(e.target.value)}
            style={{ padding: 10, border: '1px solid #ddd', borderRadius: 8, color: '#111' }}
          />
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontSize: 13, color: '#111' }}>Category</label>
          <input
            value={category ?? ''}
            onChange={(e) => setCategory(e.target.value)}
            style={{ padding: 10, border: '1px solid #ddd', borderRadius: 8, color: '#111' }}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <label style={{ fontSize: 13, color: '#111' }}>Published At (ISO / 任意)</label>
        <input
          value={publishedAt ?? ''}
          onChange={(e) => setPublishedAt(e.target.value)}
          placeholder="2025-05-11T23:00:00+00:00"
          style={{ padding: 10, border: '1px solid #ddd', borderRadius: 8, color: '#111' }}
        />
      </div>

      {err && <Notice kind="error">{err}</Notice>}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button
          onClick={props.onCancel}
          disabled={saving}
          style={{ padding: '8px 14px', color: '#111' }}
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={saving}
          style={{ padding: '8px 14px', color: '#111' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export default function Page() {
  const [mode, setMode] = useState<'list' | 'search'>('list');
  const [q, setQ] = useState('');

  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [articles, setArticles] = useState<Article[]>([]);
  const [hits, setHits] = useState<SearchHit[]>([]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<Article | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [formInitial, setFormInitial] = useState<Partial<Article> | undefined>(undefined);

  const items = useMemo(() => (mode === 'search' ? hits.map((h) => h.article) : articles), [
    mode,
    hits,
    articles,
  ]);

  const countLabel = `${items.length}件のアイテムを表示`;

  async function refreshList() {
    setErr(null);
    setLoading(true);
    try {
      const data = await api<Article[]>(`/articles?limit=30&offset=0`);
      setArticles(Array.isArray(data) ? data : []);
      setMode('list');
      setHits([]);
    } catch (e: unknown) {
      setErr(toErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshList();
  }, []);

  async function doSearch() {
    const query = q.trim();
    if (!query) return;

    setErr(null);
    setLoading(true);
    try {
      const data = await api<SearchHit[]>(`/articles/search?q=${encodeURIComponent(query)}&limit=10`);
      setHits(Array.isArray(data) ? data : []);
      setMode('search');
    } catch (e: unknown) {
      setErr(toErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(a: Article) {
    setErr(null);
    setBusyId(a.id);
    try {
      const full = await api<Article>(`/articles/${a.id}`);
      setSelected(full);
      setDetailOpen(true);
    } catch (e: unknown) {
      setErr(toErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function openEdit(a: Article) {
    setErr(null);
    setBusyId(a.id);
    try {
      const full = await api<Article>(`/articles/${a.id}`);
      setFormMode('edit');
      setFormInitial(full);
      setFormOpen(true);
    } catch (e: unknown) {
      setErr(toErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function removeArticle(a: Article) {
    if (!confirm(`Delete article #${a.id}?`)) return;

    setErr(null);
    setBusyId(a.id);
    try {
      await api<void>(`/articles/${a.id}`, { method: 'DELETE' });
      await refreshList();
    } catch (e: unknown) {
      setErr(toErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main
      style={{
        padding: 20,
        maxWidth: 1100,
        margin: '0 auto',
        fontFamily: 'sans-serif',
        color: '#111', // ← 全体を黒に固定
        background: '#fff',
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, color: '#111' }}>テックインサイト</h1>
      <div style={{ marginTop: 6, color: '#666', fontSize: 13 }}>
        セマンティック検索を備えたローカル知識ベース（FastAPI + PostgreSQL + pgvector）
      </div>

      <div
        style={{
          marginTop: 14,
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
          color: '#111',
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="自然文で検索（例: FastAPI Docker PostgreSQL）"
          style={{
            padding: 10,
            border: '1px solid #ddd',
            borderRadius: 10,
            minWidth: 320,
            flex: 1,
            color: '#111',
            background: '#fff',
          }}
        />

        <button
          onClick={doSearch}
          disabled={loading || q.trim().length === 0}
          style={{ padding: '10px 14px', color: '#111' }}
        >
          {loading && mode === 'search' ? '検索中…' : 'セマンティック検索'}
        </button>

        <button onClick={refreshList} disabled={loading} style={{ padding: '10px 14px', color: '#111' }}>
          {loading && mode === 'list' ? '読み込み中…' : 'リスト'}
        </button>

        <div style={{ flex: '1 1 auto' }} />

        <button
          onClick={() => {
            setFormMode('create');
            setFormInitial(undefined);
            setFormOpen(true);
          }}
          style={{ padding: '10px 14px', color: '#111' }}
        >
          + 新着
        </button>
      </div>

      {mode === 'search' && (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 10,
            border: '1px solid #ddd',
            background: '#fffef2',
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            color: '#111', // ← 黒
          }}
        >
          <div style={{ fontWeight: 800, color: '#111' }}>検索結果を表示中</div>
          <div style={{ color: '#666', fontSize: 13 }}>query: {q.trim()}</div>
          <div style={{ flex: 1 }} />
          <button onClick={refreshList} disabled={loading} style={{ padding: '8px 12px', color: '#111' }}>
            一覧に戻る
          </button>
        </div>
      )}

      {err && <Notice kind="error">{err}</Notice>}

      {loading && <Notice kind="info">{mode === 'search' ? '検索中…' : '読み込み中…'}</Notice>}

      {!loading && items.length === 0 && (
        <Notice kind="info">{mode === 'search' ? '検索結果がありません。' : '記事がありません。'}</Notice>
      )}

      <div style={{ marginTop: 12, color: '#666', fontSize: 13 }}>{countLabel}</div>

      <div style={{ marginTop: 12, display: 'grid', gap: 10, color: '#111' }}>
        {items.map((a) => {
          const hit = mode === 'search' ? hits.find((h) => h.article.id === a.id) : null;

          return (
            <div
              key={a.id}
              style={{
                border: mode === 'search' ? '1px solid #e6d08a' : '1px solid #eee',
                background: mode === 'search' ? '#fffdf4' : '#fff',
                borderRadius: 12,
                padding: 14,
                display: 'grid',
                gap: 8,
                color: '#111', // ← 黒
              }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#111' }}>
                <div style={{ fontWeight: 900, fontSize: 18, color: '#111' }}>{a.title}</div>
                <div style={{ color: '#666', fontSize: 12 }}>
                  #{a.id}
                  {a.category ? ` • ${a.category}` : ''}
                  {a.published_at ? ` • ${formatDate(a.published_at)}` : ''}
                </div>
                <div style={{ flex: 1 }} />
                {hit && (
                  <div style={{ fontSize: 12, color: '#444' }}>
                    score {(hit.score ?? 0).toFixed(3)} / dist {(hit.distance ?? 0).toFixed(3)}
                  </div>
                )}
              </div>

              <div style={{ color: '#222' }}>
                {(a.content ?? '').slice(0, 220)}
                {(a.content ?? '').length > 220 ? '…' : ''}
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#111' }}>
                <div style={{ color: '#666', fontSize: 12 }}>{a.author ? `著者：${a.author}` : ''}</div>
                <div style={{ flex: 1 }} />

                <button
                  onClick={() => openDetail(a)}
                  disabled={busyId === a.id}
                  style={{ padding: '8px 12px', color: '#111' }}
                >
                  {busyId === a.id ? '開いています…' : 'ビュー'}
                </button>

                <button
                  onClick={() => openEdit(a)}
                  disabled={busyId === a.id}
                  style={{ padding: '8px 12px', color: '#111' }}
                >
                  編集
                </button>

                <button
                  onClick={() => removeArticle(a)}
                  disabled={busyId === a.id}
                  style={{ padding: '8px 12px', color: '#111' }}
                >
                  消去
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        open={detailOpen}
        title={selected ? `記事 #${selected.id}` : '記事'}
        onClose={() => {
          setDetailOpen(false);
          setSelected(null);
        }}
      >
        {selected && (
          <div style={{ display: 'grid', gap: 10, color: '#111' }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#111' }}>{selected.title}</div>
            <div style={{ color: '#666', fontSize: 13 }}>
              {selected.category ? `カテゴリー: ${selected.category} • ` : ''}
              {selected.author ? `著者: ${selected.author} • ` : ''}
              {selected.published_at ? `公開: ${formatDate(selected.published_at)}` : ''}
            </div>
            <pre style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: 0, fontFamily: 'inherit', color: '#111' }}>
              {selected.content}
            </pre>
          </div>
        )}
      </Modal>

      <Modal
        open={formOpen}
        title={formMode === 'create' ? '記事作成' : `記事編集 #${formInitial?.id ?? ''}`}
        onClose={() => {
          setFormOpen(false);
          setFormInitial(undefined);
        }}
      >
        <ArticleForm
          mode={formMode}
          initial={formInitial}
          onCancel={() => {
            setFormOpen(false);
            setFormInitial(undefined);
          }}
          onSaved={async () => {
            setFormOpen(false);
            setFormInitial(undefined);
            await refreshList();
          }}
        />
      </Modal>
    </main>
  );
}
