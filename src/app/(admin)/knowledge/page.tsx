"use client";

import { useEffect, useState, useCallback } from "react";
import { supabaseClient } from "@/lib/supabaseClient";

type SourceRow = {
  source: string;
  chunkCount: number;
  createdAt: string;
};

type UploadChoice = "paste" | "markdown" | null;

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

function sourceFromFilename(name: string): string {
  return name.replace(/\.(md|pdf|docx?)$/i, "").trim() || name;
}

export default function KnowledgeBasePage() {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadChoice, setUploadChoice] = useState<UploadChoice>(null);
  const [sourceInput, setSourceInput] = useState("");
  const [contentInput, setContentInput] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [deletingSource, setDeletingSource] = useState<string | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadSourceName, setUploadSourceName] = useState("");
  const [pasteSourceName, setPasteSourceName] = useState("");
  const [pasteContent, setPasteContent] = useState("");

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

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasFiles = uploadFiles.length > 0;
    const hasPaste = pasteSourceName.trim() && pasteContent.trim();
    if (!hasFiles && !hasPaste) return;

    setIngestError(null);
    setIngesting(true);
    const authHeaders = await getAuthHeaders();

    try {
      if (hasFiles) {
        const formData = new FormData();
        for (const file of uploadFiles) formData.append("files", file);
        if (uploadSourceName.trim()) formData.append("source", uploadSourceName.trim());

        const res = await fetch("/api/admin/knowledge/upload", {
          method: "POST",
          credentials: "include",
          headers: authHeaders,
          body: formData,
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setIngestError(data.error ?? "Upload failed");
          return;
        }
        if (data.results?.some((r: { error?: string }) => r.error)) {
          const first = data.results.find((r: { error?: string }) => r.error);
          setIngestError(first?.error ?? "Some files failed");
          return;
        }
      }

      if (hasPaste) {
        const res = await fetch("/api/admin/knowledge", {
          method: "POST",
          credentials: "include",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            source: pasteSourceName.trim(),
            content: pasteContent.trim(),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setIngestError(data.error ?? "Failed to add pasted content");
          return;
        }
      }

      setIngestError(null);
      setUploadFiles([]);
      setUploadSourceName("");
      setPasteSourceName("");
      setPasteContent("");
      fetchSources();
    } finally {
      setIngesting(false);
    }
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

        {uploadChoice === null ? (
          <div className="knowledge-dash__upload-choices">
            <p className="knowledge-dash__upload-prompt">How do you want to upload data?</p>
            <div className="knowledge-dash__choice-grid">
              <button
                type="button"
                onClick={() => setUploadChoice("paste")}
                className="knowledge-dash__choice-card"
              >
                <span className="knowledge-dash__choice-title">Paste or type text</span>
                <span className="knowledge-dash__choice-desc">
                  Manually enter a source title and paste content into a text area.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setUploadChoice("markdown")}
                className="knowledge-dash__choice-card"
              >
                <span className="knowledge-dash__choice-title">Upload files (Markdown, PDF, Word)</span>
                <span className="knowledge-dash__choice-desc">
                  Upload .md, .pdf, or .docx files. Each file can be a separate source or combine under one name.
                </span>
              </button>
            </div>
          </div>
        ) : uploadChoice === "paste" ? (
          <>
            <button
              type="button"
              onClick={() => setUploadChoice(null)}
              className="knowledge-dash__back-btn"
            >
              ← Choose another method
            </button>
            <form onSubmit={handleIngest} className="knowledge-dash__form">
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
                Content
              </label>
              <textarea
                id="kb-content"
                value={contentInput}
                onChange={(e) => setContentInput(e.target.value)}
                placeholder="Paste or type the text to add to the knowledge base..."
                className="knowledge-dash__textarea"
                rows={10}
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
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setUploadChoice(null)}
              className="knowledge-dash__back-btn"
            >
              ← Choose another method
            </button>
            <form onSubmit={handleFileUpload} className="knowledge-dash__form">
              <label className="knowledge-dash__label" htmlFor="kb-upload-files">
                Files (Markdown, PDF, or Word)
              </label>
              <input
                id="kb-upload-files"
                type="file"
                accept=".md,text/markdown,text/x-markdown,.pdf,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                multiple
                onChange={(e) => setUploadFiles(Array.from(e.target.files ?? []))}
                className="knowledge-dash__file-input"
                disabled={ingesting}
              />
              {uploadFiles.length > 0 && (
                <p className="knowledge-dash__file-list">
                  {uploadFiles.length} file(s): {uploadFiles.map((f) => f.name).join(", ")}
                </p>
              )}
              <label className="knowledge-dash__label" htmlFor="kb-upload-source">
                Optional: single source name (if set, all files are combined under this name)
              </label>
              <input
                id="kb-upload-source"
                type="text"
                value={uploadSourceName}
                onChange={(e) => setUploadSourceName(e.target.value)}
                placeholder="Leave empty to use each filename as source"
                className="knowledge-dash__input"
                disabled={ingesting}
              />

              <p className="knowledge-dash__paste-heading">Or paste markdown</p>
              <label className="knowledge-dash__label" htmlFor="kb-paste-source">
                Source / Title
              </label>
              <input
                id="kb-paste-source"
                type="text"
                value={pasteSourceName}
                onChange={(e) => setPasteSourceName(e.target.value)}
                placeholder="e.g. FAQ, Refund Policy"
                className="knowledge-dash__input"
                disabled={ingesting}
              />
              <label className="knowledge-dash__label" htmlFor="kb-paste-content">
                Markdown content
              </label>
              <textarea
                id="kb-paste-content"
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                placeholder="Paste markdown here..."
                className="knowledge-dash__textarea"
                rows={8}
                disabled={ingesting}
              />

              {ingestError && (
                <p className="knowledge-dash__error" role="alert">
                  {ingestError}
                </p>
              )}
              <button
                type="submit"
                disabled={
                  ingesting ||
                  (uploadFiles.length === 0 && !(pasteSourceName.trim() && pasteContent.trim()))
                }
                className="knowledge-dash__btn knowledge-dash__btn--primary"
              >
                {ingesting ? "Adding…" : "Upload / Add to Knowledge Base"}
              </button>
            </form>
          </>
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
