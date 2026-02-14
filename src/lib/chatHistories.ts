import { supabaseAdmin } from "@/lib/supabaseAdmin";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TABLE = "chatbot_history";
const COLS = "id, session_id, message, customer, date_time";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Safely parse a JSONB value that Supabase may return as object OR string. */
function parseJsonField<T = Record<string, unknown>>(val: unknown): T | null {
  if (val == null) return null;
  if (typeof val === "object" && !Array.isArray(val)) return val as T;
  if (typeof val === "string") {
    try { return JSON.parse(val) as T; } catch { return null; }
  }
  return null;
}

/** Convert a raw chatbot_history row into a ChatMessage for the UI. */
function rowToChatMessage(row: Record<string, unknown>): ChatMessage {
  const msg = parseJsonField<{ type?: string; content?: string; body?: string }>(row.message);
  const cust = parseJsonField<{ name?: string; number?: string }>(row.customer);
  return {
    id: row.id as number,
    sessionId: String(row.session_id ?? ""),
    senderType: msg?.type === "human" ? "human" : "ai",
    content: msg?.content ?? msg?.body ?? "",
    customerName: cust?.name ?? null,
    customerNumber: cust?.number ?? "",
    createdAt: row.date_time ? String(row.date_time) : "",
  };
}

/* ------------------------------------------------------------------ */
/*  getConversations – conversation list for the sidebar               */
/* ------------------------------------------------------------------ */

/**
 * Fetch all rows (newest first), group by session_id.
 * The first row seen per session is its most-recent message → used for preview.
 */
export async function getConversations(): Promise<{
  conversations: ConversationSummary[];
  error?: string;
}> {
  if (!supabaseAdmin) return { conversations: [], error: "Supabase not configured" };

  const { data: rows, error } = await supabaseAdmin
    .from(TABLE)
    .select(COLS)
    .order("date_time", { ascending: false });

  if (error) return { conversations: [], error: error.message };

  const allRows = (rows ?? []) as Record<string, unknown>[];

  const bySession = new Map<string, {
    lastMessageContent: string | null;
    lastMessageAt: string | null;
    lastId: number;
    lastCustomerMessageId: number | null;
    customerNumber: string;
    customerName: string | null;
    count: number;
  }>();

  for (const row of allRows) {
    const sid = row.session_id as string;
    const msg = parseJsonField<{ type?: string; content?: string; body?: string }>(row.message);
    const cust = parseJsonField<{ name?: string; number?: string }>(row.customer);
    const content = msg?.content ?? msg?.body ?? null;
    const isHuman = msg?.type === "human";

    const existing = bySession.get(sid);
    if (!existing) {
      bySession.set(sid, {
        lastMessageContent: content,
        lastMessageAt: (row.date_time as string) ?? null,
        lastId: row.id as number,
        lastCustomerMessageId: isHuman ? (row.id as number) : null,
        customerNumber: cust?.number ?? "",
        customerName: cust?.name ?? null,
        count: 1,
      });
    } else {
      existing.count += 1;
      if (isHuman && existing.lastCustomerMessageId == null) {
        existing.lastCustomerMessageId = row.id as number;
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

  conversations.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
  return { conversations };
}

/* ------------------------------------------------------------------ */
/*  getConversationBySessionId – all messages for one thread           */
/* ------------------------------------------------------------------ */

/**
 * Simple query: select all rows for session_id, ordered by date_time asc.
 * No pagination, no .range() – matches the debug endpoint exactly.
 */
export async function getConversationBySessionId(
  sessionId: string
): Promise<{ messages: ChatMessage[]; error?: string }> {
  if (!supabaseAdmin) return { messages: [], error: "Supabase not configured" };

  const { data: rows, error } = await supabaseAdmin
    .from(TABLE)
    .select(COLS)
    .eq("session_id", sessionId)
    .order("date_time", { ascending: true });

  if (error) return { messages: [], error: error.message };

  const allRows = (rows ?? []) as Record<string, unknown>[];
  console.log(`[getConversationBySessionId] ${sessionId}: ${allRows.length} rows`);
  return { messages: allRows.map(rowToChatMessage) };
}
