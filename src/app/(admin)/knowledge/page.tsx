"use client";

import { useEffect, useState, useCallback } from "react";
import { supabaseClient } from "@/lib/supabaseClient";

type SourceRow = {
  source: string;
  chunkCount: number;
  createdAt: string;
};

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!supabaseClient) return {};
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session?.access_token) return { Authorization: `Bearer ${session.access_token}` };
  return {};
}

function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function KnowledgeBasePage() {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceInput, setSourceInput] = useState("");
  const [contentInput, setContentInput] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [deletingSource, setDeletingSource] = useState<string | null>(null);
  const [uploadMethod, setUploadMethod] = useState<"paste" | null>(null);

  const fetchSources = useCallback(async () => {
    setError(null);
    const authHeaders = await getAuthHeaders();
    const res = await fetch("/api/admin/knowledge", {
      credentials: "include",
      headers: authHeaders,
      cache: "no-store",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to load knowledge base");
      setSources([]);
      return;
    }
    const data = await res.json();
    setSources(data.sources ?? []);
  }, []);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    const source = sourceInput.trim();
    const content = contentInput.trim();
    if (!source || !content) return;

    setIngestError(null);
    setIngesting(true);
    const authHeaders = await getAuthHeaders();
    const res = await fetch("/api/admin/knowledge", {
      method: "POST",
      credentials: "include",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ source, content }),
    });
    const data = await res.json().catch(() => ({}));

    setIngesting(false);
    if (!res.ok) {
      setIngestError(data.error ?? "Failed to add knowledge");
      return;
    }
    setSourceInput("");
    setContentInput("");
    setIngestError(null);
    fetchSources();
  };

  const handleDelete = async (source: string) => {
    setDeletingSource(source);
    const authHeaders = await getAuthHeaders();
    const res = await fetch(`/api/admin/knowledge/${encodeURIComponent(source)}`, {
      method: "DELETE",
      credentials: "include",
      headers: authHeaders,
    });
    setDeletingSource(null);
    if (res.ok) fetchSources();
  };

  return (
    <div className="knowledge-dash">
      <header className="knowledge-dash__header">
        <h1 className="knowledge-dash__title">Knowledge Base</h1>
        <p className="knowledge-dash__subtitle">
          Add content here. The WhatsApp AI agent will use it to answer questions.
        </p>
      </header>

      <section className="knowledge-dash__form-section">
        <h2 className="knowledge-dash__section-title">Add content</h2>

        {uploadMethod === null ? (
          <div className="knowledge-dash__upload-choice">
            <p className="knowledge-dash__upload-prompt">How do you want to upload the data?</p>
            <div className="knowledge-dash__upload-options">
              <button
                type="button"
                onClick={() => setUploadMethod("paste")}
                className="knowledge-dash__upload-option"
              >
                <span className="knowledge-dash__upload-option-title">Paste text or Markdown</span>
                <span className="knowledge-dash__upload-option-desc">
                  Paste or type content. Full Markdown is supported (headings, lists, code, links).
                </span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleIngest} className="knowledge-dash__form">
            <button
              type="button"
              onClick={() => setUploadMethod(null)}
              className="knowledge-dash__back-btn"
            >
              ← Choose another method
            </button>
            <label className="knowledge-dash__label" htmlFor="kb-source">
              Source / Title
            </label>
            <input
              id="kb-source"
              type="text"
              value={sourceInput}
              onChange={(e) => setSourceInput(e.target.value)}
              placeholder="e.g. FAQ, Refund Policy"
              className="knowledge-dash__input"
              disabled={ingesting}
            />
            <label className="knowledge-dash__label" htmlFor="kb-content">
              Content (plain text or Markdown)
            </label>
            <textarea
              id="kb-content"
              value={contentInput}
              onChange={(e) => setContentInput(e.target.value)}
              placeholder="Paste or type content. Full Markdown supported: # headings, **bold**, lists, code blocks, links..."
              className="knowledge-dash__textarea"
              rows={12}
              disabled={ingesting}
            />
            {ingestError && (
              <p className="knowledge-dash__error" role="alert">
                {ingestError}
              </p>
            )}
            <button
              type="submit"
              disabled={ingesting || !sourceInput.trim() || !contentInput.trim()}
              className="knowledge-dash__btn knowledge-dash__btn--primary"
            >
              {ingesting ? "Adding…" : "Add to Knowledge Base"}
            </button>
          </form>
        )}
      </section>

      <section className="knowledge-dash__list-section">
        <h2 className="knowledge-dash__section-title">Existing sources</h2>
        {loading ? (
          <p className="knowledge-dash__muted">Loading...</p>
        ) : error ? (
          <p className="knowledge-dash__error" role="alert">
            {error}
          </p>
        ) : sources.length === 0 ? (
          <p className="knowledge-dash__muted">No knowledge added yet.</p>
        ) : (
          <div className="knowledge-dash__table-wrap">
            <table className="knowledge-dash__table">
              <thead>
                <tr>
                  <th className="knowledge-dash__th">Source</th>
                  <th className="knowledge-dash__th">Chunks</th>
                  <th className="knowledge-dash__th">Updated</th>
                  <th className="knowledge-dash__th knowledge-dash__th--action" />
                </tr>
              </thead>
              <tbody>
                {sources.map((row) => (
                  <tr key={row.source} className="knowledge-dash__tr">
                    <td className="knowledge-dash__td">{row.source}</td>
                    <td className="knowledge-dash__td">{row.chunkCount}</td>
                    <td className="knowledge-dash__td">{formatDate(row.createdAt)}</td>
                    <td className="knowledge-dash__td knowledge-dash__td--action">
                      <button
                        type="button"
                        onClick={() => handleDelete(row.source)}
                        disabled={deletingSource === row.source}
                        className="knowledge-dash__btn knowledge-dash__btn--danger"
                      >
                        {deletingSource === row.source ? "Deleting…" : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
