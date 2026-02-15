"use client";

import { useEffect, useState, useCallback } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/whatsapp/aiModeSettings";

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!supabaseClient) return {};
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session?.access_token) return { Authorization: `Bearer ${session.access_token}` };
  return {};
}

export default function SystemPromptPage() {
  const [systemPrompt, setSystemPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/admin/whatsapp/settings", {
        credentials: "include",
        headers: authHeaders,
        cache: "no-store",
      });
      if (!res.ok) {
        setError("Failed to load settings");
        return;
      }
      const data = await res.json();
      setSystemPrompt(typeof data.systemPrompt === "string" ? data.systemPrompt : "");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/admin/whatsapp/settings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          systemPrompt: systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT,
        }),
      });
      if (!res.ok) {
        setError("Failed to save prompt");
        return;
      }
      const data = await res.json();
      setSystemPrompt(typeof data.systemPrompt === "string" ? data.systemPrompt : "");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="knowledge-dash">
      <header className="knowledge-dash__header">
        <h1 className="knowledge-dash__title">System prompt</h1>
        <p className="knowledge-dash__subtitle">
          Instructions the WhatsApp AI follows for every reply. Edit here or leave blank to use the default.
        </p>
      </header>

      <section className="knowledge-dash__form-section">
        {loading ? (
          <p className="knowledge-dash__muted">Loading...</p>
        ) : (
          <form onSubmit={handleSave} className="knowledge-dash__form">
            <label className="knowledge-dash__label" htmlFor="system-prompt">
              Prompt
            </label>
            <textarea
              id="system-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={DEFAULT_SYSTEM_PROMPT}
              className="knowledge-dash__textarea"
              rows={12}
              disabled={saving}
            />
            {error && (
              <p className="knowledge-dash__error" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={saving}
              className="knowledge-dash__btn knowledge-dash__btn--primary"
            >
              {saving ? "Saving…" : "Save prompt"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
