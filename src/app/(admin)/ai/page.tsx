"use client";

import { useEffect, useState, useCallback } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_MODEL } from "@/lib/whatsapp/aiModeSettings";

const OPENAI_CHAT_MODELS = [
  { id: "gpt-4o", label: "GPT-4o", desc: "Flagship. Fast, smart, multimodal." },
  { id: "gpt-4o-mini", label: "GPT-4o mini", desc: "Lightweight and affordable." },
  { id: "gpt-4-turbo", label: "GPT-4 Turbo", desc: "High capability, 128k context." },
  { id: "gpt-4", label: "GPT-4", desc: "Original GPT-4." },
  { id: "gpt-3.5-turbo", label: "GPT-3.5 Turbo", desc: "Fast and low-cost." },
  { id: "o1", label: "o1", desc: "Reasoning model for complex tasks." },
  { id: "o1-mini", label: "o1 mini", desc: "Smaller reasoning model." },
];

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!supabaseClient) return {};
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session?.access_token) return { Authorization: `Bearer ${session.access_token}` };
  return {};
}

export default function AIPage() {
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [customModel, setCustomModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveModel = model === "custom" ? customModel.trim() || DEFAULT_MODEL : model;

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
      const savedModel = typeof data.model === "string" ? data.model.trim() : DEFAULT_MODEL;
      const isKnown = OPENAI_CHAT_MODELS.some((m) => m.id === savedModel);
      if (isKnown) {
        setModel(savedModel);
        setCustomModel("");
      } else {
        setModel("custom");
        setCustomModel(savedModel || "");
      }
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
          model: effectiveModel,
          systemPrompt: systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT,
        }),
      });
      if (!res.ok) {
        setError("Failed to save");
        return;
      }
      const data = await res.json();
      const savedModel = typeof data.model === "string" ? data.model.trim() : DEFAULT_MODEL;
      const isKnown = OPENAI_CHAT_MODELS.some((m) => m.id === savedModel);
      if (isKnown) {
        setModel(savedModel);
        setCustomModel("");
      } else {
        setModel("custom");
        setCustomModel(savedModel || "");
      }
      setSystemPrompt(typeof data.systemPrompt === "string" ? data.systemPrompt : "");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="knowledge-dash ai-page">
      <header className="knowledge-dash__header">
        <h1 className="knowledge-dash__title">AI</h1>
        <p className="knowledge-dash__subtitle">
          Choose the OpenAI chat model and system prompt for the WhatsApp assistant.
        </p>
      </header>

      <section className="knowledge-dash__form-section">
        {loading ? (
          <p className="knowledge-dash__muted">Loading...</p>
        ) : (
          <form onSubmit={handleSave} className="knowledge-dash__form">
            <span className="knowledge-dash__label">Model</span>
            <div className="ai-model-picker">
              {OPENAI_CHAT_MODELS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModel(m.id)}
                  disabled={saving}
                  className={`ai-model-picker__card ${model === m.id ? "ai-model-picker__card--selected" : ""}`}
                >
                  <span className="ai-model-picker__name">{m.label}</span>
                  <span className="ai-model-picker__desc">{m.desc}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setModel("custom")}
                disabled={saving}
                className={`ai-model-picker__card ai-model-picker__card--custom ${model === "custom" ? "ai-model-picker__card--selected" : ""}`}
              >
                <span className="ai-model-picker__name">Custom</span>
                <span className="ai-model-picker__desc">Enter any model ID.</span>
              </button>
            </div>
            {model === "custom" && (
              <input
                id="ai-custom-model"
                type="text"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="e.g. gpt-4o-2024-08-06"
                className="knowledge-dash__input"
                disabled={saving}
              />
            )}

            <label className="knowledge-dash__label" htmlFor="system-prompt">
              System prompt
            </label>
            <textarea
              id="system-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder={DEFAULT_SYSTEM_PROMPT}
              className="knowledge-dash__textarea"
              rows={10}
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
              {saving ? "Saving…" : "Save"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
