import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** Parse message/customer from DB: can be JSON string or already an object (JSONB). */
function parseMessage(raw: unknown): { type?: string; content?: string; body?: string } | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as { type?: string; content?: string; body?: string };
    } catch {
      return null;
    }
  }
  if (typeof raw === "object" && raw !== null) {
    return raw as { type?: string; content?: string; body?: string };
  }
  return null;
}

function parseCustomer(raw: unknown): { number?: string; name?: string } | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as { number?: string; name?: string };
    } catch {
      return null;
    }
  }
  if (typeof raw === "object" && raw !== null) {
    return raw as { number?: string; name?: string };
  }
  return null;
}

export interface ConversationSummary {
  sessionId: string;
  customerName: string | null;
  customerNumber: string;
  lastMessageContent: string | null;
  lastMessageAt: string | null;
  messageCount: number;
  lastCustomerMessageId: number | null;
}

export interface ChatMessage {
  id: number;
  sessionId: string;
  senderType: "human" | "ai";
  content: string;
  customerName: string | null;
  customerNumber: string;
  createdAt: string;
}

/**
 * List conversations: group by session_id, latest message, count. Sorted by last message desc.
 */
export async function getConversations(): Promise<{
  conversations: ConversationSummary[];
  error?: string;
}> {
  if (!supabaseAdmin) {
    return { conversations: [], error: "Supabase not configured" };
  }

  const { data: rows, error } = await supabaseAdmin
    .from("chatbot_history")
    .select("id, session_id, message, customer, date_time")
    .order("date_time", { ascending: false })
    .limit(50000);

  if (error) {
    return { conversations: [], error: error.message };
  }

  const bySession = new Map<
    string,
    {
      lastMessageContent: string | null;
      lastMessageAt: string | null;
      lastId: number;
      lastCustomerMessageId: number | null;
      customerNumber: string;
      customerName: string | null;
      count: number;
    }
  >();

  for (const row of rows ?? []) {
    const sessionId = row.session_id as string;
    const existing = bySession.get(sessionId);
    const msg = parseMessage(row.message);
    const customer = parseCustomer(row.customer);
    const content = msg?.content ?? msg?.body ?? null;
    const isHuman = msg?.type === "human";

    if (!existing) {
      bySession.set(sessionId, {
        lastMessageContent: content,
        lastMessageAt: row.date_time,
        lastId: row.id,
        lastCustomerMessageId: isHuman ? row.id : null,
        customerNumber: customer?.number ?? "",
        customerName: customer?.name ?? null,
        count: 1,
      });
    } else {
      existing.count += 1;
      // Rows are desc by date_time; first row per session is latest. If we didn't have a human message yet and this (older) row is human, use it as lastCustomerMessageId for unread — we want the latest human message id, so only set when we first see a human (which when iterating desc is the most recent human).
      if (isHuman && existing.lastCustomerMessageId == null) {
        existing.lastCustomerMessageId = row.id;
      }
    }
  }

  const conversations: ConversationSummary[] = Array.from(bySession.entries()).map(
    ([sessionId, v]) => ({
      sessionId,
      customerName: v.customerName,
      customerNumber: v.customerNumber,
      lastMessageContent: v.lastMessageContent,
      lastMessageAt: v.lastMessageAt,
      messageCount: v.count,
      lastCustomerMessageId: v.lastCustomerMessageId,
    })
  );

  conversations.sort((a, b) => {
    const t1 = a.lastMessageAt ?? "";
    const t2 = b.lastMessageAt ?? "";
    return t2.localeCompare(t1);
  });

  return { conversations };
}

/**
 * Get all messages for a conversation, ordered by date_time ascending.
 * Uses a high limit so Supabase default (1000) doesn't hide older messages.
 */
export async function getConversationBySessionId(
  sessionId: string
): Promise<{ messages: ChatMessage[]; error?: string }> {
  if (!supabaseAdmin) {
    return { messages: [], error: "Supabase not configured" };
  }

  const { data: rows, error } = await supabaseAdmin
    .from("chatbot_history")
    .select("id, session_id, message, customer, date_time")
    .eq("session_id", sessionId)
    .order("date_time", { ascending: true })
    .limit(10000);

  if (error) {
    return { messages: [], error: error.message };
  }

  const messages: ChatMessage[] = (rows ?? []).map((row) => {
    const msg = parseMessage(row.message);
    const customer = parseCustomer(row.customer);
    const type = msg?.type === "human" ? "human" : "ai";
    const content =
      typeof msg?.content === "string"
        ? msg.content
        : typeof msg?.body === "string"
          ? msg.body
          : "";
    return {
      id: row.id,
      sessionId: String(row.session_id ?? ""),
      senderType: type as "human" | "ai",
      content,
      customerName: customer?.name ?? null,
      customerNumber: customer?.number ?? "",
      createdAt: row.date_time ? String(row.date_time) : "",
    };
  });

  return { messages };
}
