"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/whatsapp/aiModeSettings";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ConversationSummary = {
  sessionId: string;
  customerName: string | null;
  customerNumber: string;
  lastMessageContent: string | null;
  lastMessageAt: string | null;
  messageCount: number;
  lastCustomerMessageId: number | null;
};

type ChatMessage = {
  id: number;
  sessionId: string;
  senderType: "human" | "ai";
  content: string;
  customerName: string | null;
  customerNumber: string;
  createdAt: string;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const VIEWED_KEY = "webfluential_whatsapp_viewed";

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (dDate.getTime() === today.getTime())
    return "Today " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (dDate.getTime() === yesterday.getTime())
    return "Yesterday " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getViewedSet(): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    const s = localStorage.getItem(VIEWED_KEY);
    if (!s) return new Set();
    return new Set(JSON.parse(s).map(Number));
  } catch {
    return new Set();
  }
}

function addViewed(id: number) {
  const set = getViewedSet();
  set.add(id);
  try { localStorage.setItem(VIEWED_KEY, JSON.stringify([...set])); } catch {}
}

/** Safely parse a JSONB value that Supabase Realtime may return as object or string. */
function parseJson<T = Record<string, unknown>>(val: unknown): T | null {
  if (val == null) return null;
  if (typeof val === "object" && !Array.isArray(val)) return val as T;
  if (typeof val === "string") {
    try { return JSON.parse(val) as T; } catch { return null; }
  }
  return null;
}

/** Convert a Realtime INSERT payload row into a ChatMessage. */
function realtimeRowToMessage(row: {
  id: number;
  session_id: string;
  message: unknown;
  customer: unknown;
  date_time: string;
}): ChatMessage {
  const msg = parseJson<{ type?: string; content?: string; body?: string }>(row.message);
  const cust = parseJson<{ name?: string; number?: string }>(row.customer);
  return {
    id: row.id,
    sessionId: row.session_id,
    senderType: msg?.type === "human" ? "human" : "ai",
    content: msg?.content ?? msg?.body ?? "",
    customerName: cust?.name ?? null,
    customerNumber: cust?.number ?? "",
    createdAt: row.date_time,
  };
}

/** Auth headers so API routes can validate when cookies are not sent. */
async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!supabaseClient) return {};
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session?.access_token) return { Authorization: `Bearer ${session.access_token}` };
  return {};
}

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function WhatsAppDashboardPage() {
  /* State */
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [humanInControl, setHumanInControl] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [viewedIds, setViewedIds] = useState<Set<number>>(getViewedSet);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiSettings, setAiSettings] = useState<{
    devMode: boolean;
    allowedNumbers: string[];
    systemPrompt: string;
  }>({
    devMode: true,
    allowedNumbers: [],
    systemPrompt: "",
  });
  const [newNumberInput, setNewNumberInput] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [promptSectionOpen, setPromptSectionOpen] = useState(false);

  /* Refs */
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedSessionIdRef = useRef(selectedSessionId);
  const conversationsRef = useRef(conversations);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabaseClient>["channel"]> | null>(null);

  // Keep refs in sync
  selectedSessionIdRef.current = selectedSessionId;
  conversationsRef.current = conversations;

  /* Derived */
  const selectedConv = conversations.find((c) => c.sessionId === selectedSessionId);
  const customerName = selectedConv?.customerName ?? selectedConv?.customerNumber ?? "Customer";
  const customerNumber = selectedConv?.customerNumber ?? "";

  /* ---------------------------------------------------------------- */
  /*  Data fetching                                                    */
  /* ---------------------------------------------------------------- */

  const fetchConversations = useCallback(async () => {
    setListError(null);
    const authHeaders = await getAuthHeaders();
    const res = await fetch("/api/admin/whatsapp/conversations", {
      credentials: "include",
      headers: authHeaders,
      cache: "no-store",
    });
    if (!res.ok) {
      let msg = "Failed to load conversations.";
      try { const b = await res.json(); if (b.reason) msg = b.reason; } catch {}
      setListError(msg);
      setConversations([]);
      return;
    }
    const data = await res.json();
    setConversations(data.conversations ?? []);
  }, []);

  const fetchMessages = useCallback(async (sessionId: string) => {
    setMessagesError(null);
    const authHeaders = await getAuthHeaders();
    const res = await fetch(`/api/admin/whatsapp/conversations/${encodeURIComponent(sessionId)}`, {
      credentials: "include",
      headers: authHeaders,
      cache: "no-store",
    });
    if (!res.ok) {
      let msg = "Failed to load messages.";
      try { const b = await res.json(); if (b.reason) msg = b.reason; } catch {}
      setMessagesError(msg);
      setMessages([]);
      return;
    }
    const data = await res.json();
    const msgs: ChatMessage[] = data.messages ?? [];
    console.log(`[fetchMessages] ${sessionId}: ${msgs.length} messages loaded`);
    setMessages(msgs);
  }, []);

  const fetchHumanControl = useCallback(async (sessionId: string) => {
    const authHeaders = await getAuthHeaders();
    const res = await fetch(
      `/api/admin/whatsapp/human-control?sessionId=${encodeURIComponent(sessionId)}`,
      { credentials: "include", headers: authHeaders }
    );
    if (!res.ok) return;
    const data = await res.json();
    setHumanInControl(data.isHumanInControl === true);
  }, []);

  const fetchSettings = useCallback(async () => {
    const authHeaders = await getAuthHeaders();
    const res = await fetch("/api/admin/whatsapp/settings", {
      credentials: "include",
      headers: authHeaders,
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = await res.json();
    setAiSettings({
      devMode: data.devMode !== false,
      allowedNumbers: Array.isArray(data.allowedNumbers) ? data.allowedNumbers : [],
      systemPrompt: typeof data.systemPrompt === "string" ? data.systemPrompt : "",
    });
  }, []);

  const saveSettings = useCallback(
    async (update: { devMode?: boolean; allowedNumbers?: string[]; systemPrompt?: string }) => {
      setSavingSettings(true);
      try {
        const authHeaders = await getAuthHeaders();
        const res = await fetch("/api/admin/whatsapp/settings", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify(update),
        });
        if (!res.ok) return;
        const data = await res.json();
        setAiSettings({
          devMode: data.devMode !== false,
          allowedNumbers: Array.isArray(data.allowedNumbers) ? data.allowedNumbers : [],
          systemPrompt: typeof data.systemPrompt === "string" ? data.systemPrompt : "",
        });
      } finally {
        setSavingSettings(false);
      }
    },
    []
  );

  const handleOpenSettings = useCallback(() => {
    setSettingsOpen(true);
    fetchSettings();
  }, [fetchSettings]);

  const handleToggleDevMode = useCallback(
    (devMode: boolean) => {
      saveSettings({ ...aiSettings, devMode });
    },
    [aiSettings, saveSettings]
  );

  const handleAddNumber = useCallback(() => {
    const digits = newNumberInput.replace(/\D/g, "");
    if (!digits) return;
    const next = aiSettings.allowedNumbers.includes(digits)
      ? aiSettings.allowedNumbers
      : [...aiSettings.allowedNumbers, digits];
    setNewNumberInput("");
    saveSettings({ ...aiSettings, allowedNumbers: next });
  }, [aiSettings, newNumberInput, saveSettings]);

  const handleRemoveNumber = useCallback(
    (digits: string) => {
      const next = aiSettings.allowedNumbers.filter((n) => n !== digits);
      saveSettings({ ...aiSettings, allowedNumbers: next });
    },
    [aiSettings, saveSettings]
  );

  /* ---------------------------------------------------------------- */
  /*  Realtime subscription (§3 of the guide)                          */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const client = supabaseClient;
    if (!client) return;

    // Unsubscribe previous channel if any
    if (channelRef.current) {
      client.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = client
      .channel("chatbot_history_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chatbot_history" },
        (payload) => {
          const row = payload.new as {
            id: number;
            session_id: string;
            message: unknown;
            customer: unknown;
            date_time: string;
          };

          const newMsg = realtimeRowToMessage(row);
          const currentSelected = selectedSessionIdRef.current;

          /* ---- Update open conversation thread ---- */
          if (row.session_id === currentSelected) {
            setMessages((prev) => {
              // Deduplicate by id (optimistic message may already be there)
              if (prev.some((m) => m.id === row.id)) return prev;
              // Append and sort by id to keep correct order
              const next = [...prev, newMsg];
              next.sort((a, b) => a.id - b.id);
              return next;
            });

            // Mark human messages as viewed
            if (newMsg.senderType === "human") {
              addViewed(row.id);
              setViewedIds(getViewedSet());
            }
          }

          /* ---- Update conversation list preview ---- */
          setConversations((prev) => {
            const idx = prev.findIndex((c) => c.sessionId === row.session_id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = {
                ...updated[idx],
                lastMessageContent: newMsg.content,
                lastMessageAt: row.date_time,
                messageCount: updated[idx].messageCount + 1,
                lastCustomerMessageId:
                  newMsg.senderType === "human" ? row.id : updated[idx].lastCustomerMessageId,
              };
              updated.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
              return updated;
            }
            // New conversation we don't know about — refetch the full list
            fetchConversations();
            return prev;
          });
        }
      )
      .subscribe((status) => {
        console.log(`[Realtime] subscription status: ${status}`);
        if (status === "SUBSCRIBED") {
          // Refresh list once subscription is confirmed
          fetchConversations();
        }
      });

    channelRef.current = channel;

    return () => {
      client.removeChannel(channel);
      channelRef.current = null;
    };
  }, [fetchConversations]);

  /* ---------------------------------------------------------------- */
  /*  Load conversations on mount                                      */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    fetchConversations().finally(() => setLoading(false));
  }, [fetchConversations]);

  /* ---------------------------------------------------------------- */
  /*  Load messages when a conversation is selected                    */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!selectedSessionId) {
      setMessages([]);
      setHumanInControl(false);
      return;
    }
    fetchMessages(selectedSessionId);
    fetchHumanControl(selectedSessionId);
  }, [selectedSessionId, fetchMessages, fetchHumanControl]);

  /* ---------------------------------------------------------------- */
  /*  Scroll to bottom when messages change                            */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Jump to bottom immediately (no smooth scroll)
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  /* ---------------------------------------------------------------- */
  /*  Actions                                                          */
  /* ---------------------------------------------------------------- */

  const handleTakeOver = async () => {
    if (!selectedSessionId) return;
    const authHeaders = await getAuthHeaders();
    const res = await fetch("/api/admin/whatsapp/human-control", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ sessionId: selectedSessionId, isHumanInControl: true }),
      credentials: "include",
    });
    if (res.ok) setHumanInControl(true);
  };

  const handleHandoverToAI = async () => {
    if (!selectedSessionId) return;
    const authHeaders = await getAuthHeaders();
    const res = await fetch("/api/admin/whatsapp/human-control", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ sessionId: selectedSessionId, isHumanInControl: false }),
      credentials: "include",
    });
    if (res.ok) {
      setHumanInControl(false);
      setInputValue("");
    }
  };

  /**
   * Send a message from the dashboard (staff / human mode).
   *
   * Flow per the guide §4 "Staff sends a message":
   * 1. POST to send-message API → sends via WhatsApp + saves to chatbot_history.
   * 2. Optimistically add the message to the thread using the id/date_time
   *    returned by the API, so the user sees it immediately.
   * 3. When the Realtime INSERT arrives, the dedupe check (by id) prevents a
   *    duplicate from being added.
   */
  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || !customerNumber || sending) return;
    setSending(true);
    try {
      const authHeaders = await getAuthHeaders();
      const res = await fetch("/api/admin/whatsapp/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          message: text,
          customerName: selectedConv?.customerName ?? undefined,
          customerNumber,
        }),
        credentials: "include",
      });

      if (res.ok) {
        setInputValue("");
        const data = await res.json().catch(() => ({}));
        const savedId: number = data?.id ?? -Date.now(); // fallback
        const savedAt: string = data?.date_time ?? new Date().toISOString();

        if (selectedSessionId) {
          // Optimistic: add to thread immediately
          const optimistic: ChatMessage = {
            id: savedId,
            sessionId: selectedSessionId,
            senderType: "ai",
            content: text,
            customerName: selectedConv?.customerName ?? null,
            customerNumber,
            createdAt: savedAt,
          };
          setMessages((prev) => {
            // Dedupe just in case Realtime was faster
            if (prev.some((m) => m.id === savedId)) return prev;
            const next = [...prev, optimistic];
            next.sort((a, b) => a.id - b.id);
            return next;
          });

          // Optimistic: update conversation list preview
          setConversations((prev) => {
            const updated = prev.map((c) =>
              c.sessionId === selectedSessionId
                ? { ...c, lastMessageContent: text, lastMessageAt: savedAt }
                : c
            );
            updated.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
            return updated;
          });
        }
      }
    } finally {
      setSending(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Filtered list                                                    */
  /* ---------------------------------------------------------------- */

  const filteredConversations = search.trim()
    ? conversations.filter((c) => {
        const q = search.toLowerCase();
        return (
          (c.customerName ?? "").toLowerCase().includes(q) ||
          (c.customerNumber ?? "").toLowerCase().includes(q) ||
          (c.lastMessageContent ?? "").toLowerCase().includes(q)
        );
      })
    : conversations;

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="whatsapp-dash">
      {/* ---------- Conversation list ---------- */}
      <div className="whatsapp-dash__list">
        <div className="whatsapp-dash__list-header">
          <div className="whatsapp-dash__title-row">
            <h2 className="whatsapp-dash__title">WhatsApp</h2>
            <button
              type="button"
              onClick={handleOpenSettings}
              className="whatsapp-dash__settings-btn"
              aria-label="Settings"
            >
              <SettingsIcon />
            </button>
          </div>
          <input
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="whatsapp-dash__search"
          />
        </div>
        <div className="whatsapp-dash__conversations">
          {loading ? (
            <p className="whatsapp-dash__muted">Loading...</p>
          ) : listError ? (
            <p className="whatsapp-dash__error" role="alert">{listError}</p>
          ) : filteredConversations.length === 0 ? (
            <p className="whatsapp-dash__muted">No conversations yet.</p>
          ) : (
            filteredConversations.map((c) => {
              const isSelected = c.sessionId === selectedSessionId;
              const lastHumanId = c.lastCustomerMessageId;
              const unread = lastHumanId != null && !viewedIds.has(lastHumanId);
              return (
                <button
                  key={c.sessionId}
                  type="button"
                  onClick={() => {
                    setSelectedSessionId(c.sessionId);
                    if (lastHumanId != null) {
                      addViewed(lastHumanId);
                      setViewedIds(getViewedSet());
                    }
                  }}
                  className={`whatsapp-dash__conv ${isSelected ? "whatsapp-dash__conv--selected" : ""}`}
                >
                  <div className="whatsapp-dash__conv-main">
                    <span className="whatsapp-dash__conv-name">
                      {c.customerName || c.customerNumber || c.sessionId}
                    </span>
                    {unread && <span className="whatsapp-dash__conv-unread" />}
                  </div>
                  <p className="whatsapp-dash__conv-preview">
                    {c.lastMessageContent ?? "--"}
                  </p>
                  <span className="whatsapp-dash__conv-time">
                    {c.lastMessageAt ? formatTime(c.lastMessageAt) : ""}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ---------- Thread ---------- */}
      <div className="whatsapp-dash__thread">
        {!selectedSessionId ? (
          <div className="whatsapp-dash__empty">
            <p>Select a conversation</p>
          </div>
        ) : (
          <>
            <header className="whatsapp-dash__thread-header">
              <h3 className="whatsapp-dash__thread-title">{customerName}</h3>
            </header>
            {messagesError && (
              <p className="whatsapp-dash__error whatsapp-dash__error--thread" role="alert">
                {messagesError}
              </p>
            )}
            <div ref={scrollRef} className="whatsapp-dash__messages">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`whatsapp-dash__msg whatsapp-dash__msg--${m.senderType}`}
                >
                  <div className="whatsapp-dash__msg-bubble">
                    <p className="whatsapp-dash__msg-text">{m.content}</p>
                    <span className="whatsapp-dash__msg-time">{formatTime(m.createdAt)}</span>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="whatsapp-dash__input-bar">
              {humanInControl ? (
                <>
                  <input
                    type="text"
                    placeholder="Type a message..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                    className="whatsapp-dash__input"
                  />
                  <button
                    type="button"
                    onClick={handleHandoverToAI}
                    className="whatsapp-dash__btn whatsapp-dash__btn--secondary"
                  >
                    Handover to AI
                  </button>
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={sending || !inputValue.trim()}
                    className="whatsapp-dash__btn whatsapp-dash__btn--primary"
                  >
                    Send
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleTakeOver}
                  className="whatsapp-dash__btn whatsapp-dash__btn--primary"
                >
                  Take over
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* ---------- Settings modal ---------- */}
      {settingsOpen && (
        <div
          className="whatsapp-dash__settings-backdrop"
          onClick={() => setSettingsOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-modal-title"
        >
          <div
            className="whatsapp-dash__settings-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="whatsapp-dash__settings-header">
              <h3 id="settings-modal-title" className="whatsapp-dash__settings-title">
                Settings
              </h3>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="whatsapp-dash__settings-close"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="whatsapp-dash__settings-body">
              <div className="whatsapp-dash__settings-row">
                <div className="whatsapp-dash__settings-label-block">
                  <span className="whatsapp-dash__settings-label">AI reply mode</span>
                  <span className="whatsapp-dash__settings-desc">
                    {aiSettings.devMode
                      ? "Dev: AI only replies to the numbers listed below."
                      : "Live: AI replies to everyone."}
                  </span>
                </div>
                <div className="whatsapp-dash__settings-toggle" role="group" aria-label="AI reply mode">
                  <button
                    type="button"
                    className={`whatsapp-dash__settings-toggle-option ${aiSettings.devMode ? "whatsapp-dash__settings-toggle-option--on" : ""}`}
                    onClick={() => handleToggleDevMode(true)}
                    disabled={savingSettings}
                  >
                    Dev
                  </button>
                  <button
                    type="button"
                    className={`whatsapp-dash__settings-toggle-option ${!aiSettings.devMode ? "whatsapp-dash__settings-toggle-option--on" : ""}`}
                    onClick={() => handleToggleDevMode(false)}
                    disabled={savingSettings}
                  >
                    Live
                  </button>
                </div>
              </div>
              {aiSettings.devMode && (
                <div className="whatsapp-dash__settings-numbers">
                  <h4 className="whatsapp-dash__settings-numbers-title">
                    Numbers AI replies to
                  </h4>
                  {aiSettings.allowedNumbers.length === 0 ? (
                    <p className="whatsapp-dash__settings-muted">
                      No numbers added. Add a number below.
                    </p>
                  ) : (
                    <ul className="whatsapp-dash__settings-numbers-list">
                      {aiSettings.allowedNumbers.map((digits) => (
                        <li key={digits} className="whatsapp-dash__settings-numbers-item">
                          <span className="whatsapp-dash__settings-number-display">
                            +{digits}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveNumber(digits)}
                            className="whatsapp-dash__settings-remove"
                            aria-label={`Remove +${digits}`}
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="whatsapp-dash__settings-add">
                    <input
                      type="tel"
                      placeholder="e.g. 27693475825 or +27 69 347 5825"
                      value={newNumberInput}
                      onChange={(e) => setNewNumberInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddNumber())}
                      className="whatsapp-dash__settings-input"
                    />
                    <button
                      type="button"
                      onClick={handleAddNumber}
                      disabled={savingSettings || !newNumberInput.trim()}
                      className="whatsapp-dash__btn whatsapp-dash__btn--primary"
                    >
                      Add number
                    </button>
                  </div>
                </div>
              )}

              <div className="whatsapp-dash__settings-row whatsapp-dash__settings-row--prompt">
                <div className="whatsapp-dash__settings-label-block">
                  <span className="whatsapp-dash__settings-label">System prompt</span>
                  <span className="whatsapp-dash__settings-desc">
                    Instructions the AI follows for every reply.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setPromptSectionOpen((open) => !open)}
                  className="whatsapp-dash__btn whatsapp-dash__btn--secondary whatsapp-dash__settings-prompt-btn-inline"
                  aria-expanded={promptSectionOpen}
                >
                  {promptSectionOpen ? "Hide" : "Edit"}
                </button>
              </div>
              {promptSectionOpen && (
                <div className="whatsapp-dash__settings-prompt-open">
                  <label htmlFor="settings-system-prompt" className="whatsapp-dash__settings-prompt-label">
                    Edit prompt
                  </label>
                  <textarea
                      id="settings-system-prompt"
                      rows={5}
                      value={aiSettings.systemPrompt}
                      onChange={(e) =>
                        setAiSettings((prev) => ({ ...prev, systemPrompt: e.target.value }))
                      }
                      placeholder={DEFAULT_SYSTEM_PROMPT}
                      className="whatsapp-dash__settings-textarea"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        saveSettings({
                          systemPrompt:
                            aiSettings.systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT,
                        })
                      }
                      disabled={savingSettings}
                      className="whatsapp-dash__btn whatsapp-dash__btn--primary whatsapp-dash__settings-prompt-btn"
                    >
                      {savingSettings ? "Saving…" : "Save prompt"}
                    </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
