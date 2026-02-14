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
    const res = await fetch("/api/admin/whatsapp/conversations", { credentials: "include" });
    if (!res.ok) {
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
    const res = await fetch(`/api/admin/whatsapp/conversations/${encodeURIComponent(sessionId)}`, { credentials: "include" });
    if (!res.ok) {
      let msg = "Failed to load messages.";
      try {
        const body = await res.json();
        if (body.reason) msg = body.reason;
      } catch {}
      setMessagesError(msg);
      setMessages([]);
      return;
    }
    const data = await res.json();
    setMessages(data.messages ?? []);
  }, []);

  const fetchHumanControl = useCallback(async (sessionId: string) => {
    const res = await fetch(`/api/admin/whatsapp/human-control?sessionId=${encodeURIComponent(sessionId)}`, { credentials: "include" });
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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
            message: { type?: string; content?: string };
            customer: { number?: string; name?: string };
            date_time: string;
          };
          const newMsg: ChatMessage = {
            id: row.id,
            sessionId: row.session_id,
            senderType: row.message?.type === "human" ? "human" : "ai",
            content: row.message?.content ?? "",
            customerName: row.customer?.name ?? null,
            customerNumber: row.customer?.number ?? "",
            createdAt: row.date_time,
          };
          const currentSelected = selectedSessionIdRef.current;
          if (row.session_id === currentSelected) {
            setMessages((prev) => [...prev, newMsg]);
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
    const res = await fetch("/api/admin/whatsapp/human-control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: selectedSessionId, isHumanInControl: true }),
      credentials: "include",
    });
    if (res.ok) setHumanInControl(true);
  };

  const handleHandoverToAI = async () => {
    if (!selectedSessionId) return;
    const res = await fetch("/api/admin/whatsapp/human-control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      const res = await fetch("/api/admin/whatsapp/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          customerName: selectedConv?.customerName ?? undefined,
          customerNumber,
        }),
        credentials: "include",
      });
      if (res.ok) {
        setInputValue("");
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
                <>
                  <span className="whatsapp-dash__input-label">AI in Control</span>
                  <button
                    type="button"
                    onClick={handleTakeOver}
                    className="whatsapp-dash__btn whatsapp-dash__btn--primary"
                  >
                    Take over
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
