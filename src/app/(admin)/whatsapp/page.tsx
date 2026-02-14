"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { supabaseClient } from "@/lib/supabaseClient";

const VIEWED_KEY = "webfluential_whatsapp_viewed";

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

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (dDate.getTime() === today.getTime()) return "Today " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (dDate.getTime() === yesterday.getTime()) return "Yesterday " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
  try {
    localStorage.setItem(VIEWED_KEY, JSON.stringify([...set]));
  } catch {}
}

/** Auth headers so API routes can validate when cookies are not sent (e.g. custom domain). */
async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!supabaseClient) return {};
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session?.access_token) return { Authorization: `Bearer ${session.access_token}` };
  return {};
}

export default function WhatsAppDashboardPage() {
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedSessionIdRef = useRef(selectedSessionId);
  const conversationsRef = useRef(conversations);
  selectedSessionIdRef.current = selectedSessionId;
  conversationsRef.current = conversations;

  const selectedConv = conversations.find((c) => c.sessionId === selectedSessionId);
  const customerName = selectedConv?.customerName ?? selectedConv?.customerNumber ?? "Customer";
  const customerNumber = selectedConv?.customerNumber ?? "";

  const fetchConversations = useCallback(async () => {
    setListError(null);

    const doFetch = async (headers: Record<string, string>) => {
      return fetch("/api/admin/whatsapp/conversations", {
        credentials: "include",
        headers,
        cache: "no-store",
      });
    };

    let authHeaders = await getAuthHeaders();
    let res = await doFetch(authHeaders);

    // If 401 and we didn't send Bearer, wait for session and retry once (client may not have read cookies yet)
    if (res.status === 401 && !authHeaders.Authorization) {
      await new Promise((r) => setTimeout(r, 100));
      authHeaders = await getAuthHeaders();
      if (authHeaders.Authorization) res = await doFetch(authHeaders);
    }

    if (!res.ok) {
      if (res.status === 401) {
        console.warn("[auth] 401 from conversations API:", {
          cookiesTotal: res.headers.get("x-debug-cookies-total"),
          cookiesSb: res.headers.get("x-debug-cookies-sb"),
          hasBearer: res.headers.get("x-debug-has-bearer"),
        });
      }
      let msg = "Failed to load conversations.";
      try {
        const body = await res.json();
        if (body.reason) msg = body.reason;
      } catch {}
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
    const baseUrl = `/api/admin/whatsapp/conversations/${encodeURIComponent(sessionId)}`;

    const fetchOpts = { credentials: "include" as const, headers: authHeaders, cache: "no-store" as const };

    const resRecent = await fetch(`${baseUrl}?recent=100`, fetchOpts);
    if (!resRecent.ok) {
      let msg = "Failed to load messages.";
      try {
        const body = await resRecent.json();
        if (body.reason) msg = body.reason;
      } catch {}
      setMessagesError(msg);
      setMessages([]);
      return;
    }
    const dataRecent = await resRecent.json();
    setMessages(dataRecent.messages ?? []);

    fetch(baseUrl, fetchOpts)
      .then((resFull) => (resFull.ok ? resFull.json() : null))
      .then((dataFull) => {
        const fullMessages = dataFull?.messages ?? [];
        if (fullMessages.length <= 100) return;
        setMessages((prev) => {
          if (selectedSessionIdRef.current !== sessionId) return prev;
          return fullMessages;
        });
      })
      .catch(() => {});
  }, []);

  const fetchHumanControl = useCallback(async (sessionId: string) => {
    const authHeaders = await getAuthHeaders();
    const res = await fetch(`/api/admin/whatsapp/human-control?sessionId=${encodeURIComponent(sessionId)}`, {
      credentials: "include",
      headers: authHeaders,
    });
    if (!res.ok) return;
    const data = await res.json();
    setHumanInControl(data.isHumanInControl === true);
  }, []);

  useEffect(() => {
    fetchConversations().finally(() => setLoading(false));
  }, [fetchConversations]);

  useEffect(() => {
    if (!selectedSessionId) {
      setMessages([]);
      setHumanInControl(false);
      return;
    }
    fetchMessages(selectedSessionId);
    fetchHumanControl(selectedSessionId);
  }, [selectedSessionId, fetchMessages, fetchHumanControl]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollToBottom = () => {
      el.scrollTop = el.scrollHeight;
    };
    scrollToBottom();
    requestAnimationFrame(scrollToBottom);
  }, [messages]);

  useEffect(() => {
    const client = supabaseClient;
    if (!client) return;

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
          const msg = typeof row.message === "string" ? (() => { try { return JSON.parse(row.message) as { type?: string; content?: string; body?: string }; } catch { return {}; } })() : (row.message as { type?: string; content?: string; body?: string }) ?? {};
          const customer = typeof row.customer === "string" ? (() => { try { return JSON.parse(row.customer) as { number?: string; name?: string }; } catch { return {}; } })() : (row.customer as { number?: string; name?: string }) ?? {};
          const newMsg: ChatMessage = {
            id: row.id,
            sessionId: row.session_id,
            senderType: msg?.type === "human" ? "human" : "ai",
            content: msg?.content ?? msg?.body ?? "",
            customerName: customer?.name ?? null,
            customerNumber: customer?.number ?? "",
            createdAt: row.date_time,
          };
          const currentSelected = selectedSessionIdRef.current;
          if (row.session_id === currentSelected) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === row.id)) return prev;
              return [...prev, newMsg];
            });
            if (newMsg.senderType === "human") addViewed(row.id);
            setViewedIds(getViewedSet());
          }
          const currentList = conversationsRef.current;
          const existingIdx = currentList.findIndex((c) => c.sessionId === row.session_id);
          if (existingIdx >= 0) {
            setConversations((prev) => {
              const updated = [...prev];
              const idx = updated.findIndex((c) => c.sessionId === row.session_id);
              if (idx < 0) return prev;
              updated[idx] = {
                ...updated[idx],
                lastMessageContent: newMsg.content,
                lastMessageAt: row.date_time,
                messageCount: updated[idx].messageCount + 1,
                lastCustomerMessageId:
                  newMsg.senderType === "human" ? row.id : updated[idx].lastCustomerMessageId,
              };
              return updated.sort((a, b) => {
                const t1 = a.lastMessageAt ?? "";
                const t2 = b.lastMessageAt ?? "";
                return t2.localeCompare(t1);
              });
            });
          } else {
            fetchConversations();
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          fetchConversations();
        }
      });

    return () => {
      client.removeChannel(channel);
    };
  }, [fetchConversations]);

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
        const savedId = data?.id ?? -Date.now();
        const savedAt = data?.date_time ?? new Date().toISOString();
        // Show sent message in thread immediately (optimistic)
        if (selectedSessionId) {
          const optimistic: ChatMessage = {
            id: savedId,
            sessionId: selectedSessionId,
            senderType: "ai",
            content: text,
            customerName: selectedConv?.customerName ?? null,
            customerNumber,
            createdAt: savedAt,
          };
          setMessages((prev) => [...prev, optimistic]);
        }
        // Show sent message in list preview immediately
        if (selectedSessionId) {
          const now = savedAt;
          setConversations((prev) => {
            const updated = prev.map((c) =>
              c.sessionId === selectedSessionId
                ? { ...c, lastMessageContent: text, lastMessageAt: now }
                : c
            );
            return updated.sort((a, b) => {
              const t1 = a.lastMessageAt ?? "";
              const t2 = b.lastMessageAt ?? "";
              return t2.localeCompare(t1);
            });
          });
        }
      }
    } finally {
      setSending(false);
    }
  };

  const filteredConversations = search.trim()
    ? conversations.filter((c) => {
        const q = search.toLowerCase();
        const name = (c.customerName ?? "").toLowerCase();
        const num = (c.customerNumber ?? "").toLowerCase();
        const last = (c.lastMessageContent ?? "").toLowerCase();
        return name.includes(q) || num.includes(q) || last.includes(q);
      })
    : conversations;

  return (
    <div className="whatsapp-dash">
      <div className="whatsapp-dash__list">
        <div className="whatsapp-dash__list-header">
          <h2 className="whatsapp-dash__title">WhatsApp</h2>
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
              <p className="whatsapp-dash__error whatsapp-dash__error--thread" role="alert">{messagesError}</p>
            )}
            <div ref={scrollRef} className="whatsapp-dash__messages">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`whatsapp-dash__msg whatsapp-dash__msg--${m.senderType}`}
                >
                  <div className="whatsapp-dash__msg-bubble">
                    <p className="whatsapp-dash__msg-text">{m.content}</p>
                    <span className="whatsapp-dash__msg-time">
                      {formatTime(m.createdAt)}
                    </span>
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
    </div>
  );
}
