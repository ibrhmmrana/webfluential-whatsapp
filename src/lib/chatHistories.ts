import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

const LIST_PAGE_SIZE = 500;
const LIST_MAX_PAGES = 200;
const MESSAGES_VIEW = "chatbot_history_flat";
const MESSAGES_TABLE = "chatbot_history";
const selectCols =
  "id, session_id, msg_type, msg_content, msg_body, cust_name, cust_number, date_time";
const tableSelectCols = "id, session_id, message, customer, date_time";

function parseJsonField<T = Record<string, unknown>>(val: unknown): T | null {
  if (val == null) return null;
  if (typeof val === "object" && !Array.isArray(val) && val !== null) return val as T;
  if (typeof val === "string") {
    try {
      return JSON.parse(val) as T;
    } catch {
      return null;
    }
  }
  return null;
}

function rawRowToChatMessage(row: Record<string, unknown>): ChatMessage {
  const msg = parseJsonField<{ type?: string; content?: string; body?: string }>(row.message);
  const customer = parseJsonField<{ name?: string; number?: string }>(row.customer);
  const type = msg?.type === "human" ? "human" : "ai";
  const content = msg?.content ?? msg?.body ?? "";
  return {
    id: row.id as number,
    sessionId: String(row.session_id ?? ""),
    senderType: type as "human" | "ai",
    content,
    customerName: customer?.name ?? null,
    customerNumber: customer?.number ?? "",
    createdAt: row.date_time ? String(row.date_time) : "",
  };
}

/**
 * List conversations: group by session_id, latest message, count. Sorted by last message desc.
 * Fetches from chatbot_history table (newest first) so the first row seen per session is the most recent message; message/customer parsed in code for reliable preview text.
 */
export async function getConversations(): Promise<{
  conversations: ConversationSummary[];
  error?: string;
}> {
  if (!supabaseAdmin) {
    return { conversations: [], error: "Supabase not configured" };
  }

  const allRows: Record<string, unknown>[] = [];
  let offset = 0;
  let pageCount = 0;

  while (pageCount < LIST_MAX_PAGES) {
    pageCount += 1;
    const { data: rows, error } = await supabaseAdmin
      .from(MESSAGES_TABLE)
      .select(tableSelectCols)
      .order("date_time", { ascending: false })
      .range(offset, offset + LIST_PAGE_SIZE - 1);

    if (error) {
      return { conversations: [], error: error.message };
    }
    const page = rows ?? [];
    allRows.push(...(page as Record<string, unknown>[]));
    if (page.length < LIST_PAGE_SIZE) break;
    offset += LIST_PAGE_SIZE;
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

  for (const row of allRows) {
    const sessionId = row.session_id as string;
    const existing = bySession.get(sessionId);
    const msg = parseJsonField<{ type?: string; content?: string; body?: string }>(row.message);
    const customer = parseJsonField<{ name?: string; number?: string }>(row.customer);
    const content = msg?.content ?? msg?.body ?? null;
    const isHuman = msg?.type === "human";

    if (!existing) {
      bySession.set(sessionId, {
        lastMessageContent: content ?? null,
        lastMessageAt: (row.date_time as string) ?? null,
        lastId: row.id as number,
        lastCustomerMessageId: isHuman ? (row.id as number) : null,
        customerNumber: customer?.number ?? "",
        customerName: customer?.name ?? null,
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

  conversations.sort((a, b) => {
    const t1 = a.lastMessageAt ?? "";
    const t2 = b.lastMessageAt ?? "";
    return t2.localeCompare(t1);
  });

  return { conversations };
}

const MESSAGES_PAGE_SIZE = 500;
const MESSAGES_MAX_PAGES = 200; // 200 * 500 = 100k messages max per session

function rowToChatMessage(row: Record<string, unknown>): ChatMessage {
  const type = row.msg_type === "human" ? "human" : "ai";
  const content =
    typeof row.msg_content === "string" && row.msg_content
      ? row.msg_content
      : typeof row.msg_body === "string" && row.msg_body
        ? (row.msg_body as string)
        : "";
  return {
    id: row.id as number,
    sessionId: String(row.session_id ?? ""),
    senderType: type as "human" | "ai",
    content,
    customerName: typeof row.cust_name === "string" ? row.cust_name : null,
    customerNumber: typeof row.cust_number === "string" ? row.cust_number : "",
    createdAt: row.date_time ? String(row.date_time) : "",
  };
}

const RECENT_INITIAL_LIMIT = 100;

/**
 * Get the most recent N messages for a conversation (single query, fast).
 * Returns messages in chronological order (oldest first) for display.
 * Reads from chatbot_history table so message/customer JSON (object or string) are always parsed correctly.
 */
export async function getConversationRecent(
  sessionId: string,
  limit: number = RECENT_INITIAL_LIMIT
): Promise<{ messages: ChatMessage[]; error?: string }> {
  if (!supabaseAdmin) {
    return { messages: [], error: "Supabase not configured" };
  }

  const cap = Math.min(Math.max(1, limit), 500);
  const { data: rows, error } = await supabaseAdmin
    .from(MESSAGES_TABLE)
    .select(tableSelectCols)
    .eq("session_id", sessionId)
    .order("date_time", { ascending: false })
    .limit(cap);

  if (error) {
    return { messages: [], error: error.message };
  }

  const reversed = (rows ?? []).slice(0).reverse();
  const messages = (reversed as Record<string, unknown>[]).map(rawRowToChatMessage);
  return { messages };
}

/**
 * Get ALL messages for a conversation, ordered by date_time ascending.
 * Fetches in pages to avoid any response size/row limit; guarantees every
 * message for the session_id is returned.
 * Reads from chatbot_history table so message/customer JSON (object or string) are always parsed correctly.
 */
export async function getConversationBySessionId(
  sessionId: string
): Promise<{ messages: ChatMessage[]; error?: string }> {
  if (!supabaseAdmin) {
    return { messages: [], error: "Supabase not configured" };
  }

  const allRows: Record<string, unknown>[] = [];
  let offset = 0;
  let hasMore = true;
  let pageCount = 0;

  while (hasMore && pageCount < MESSAGES_MAX_PAGES) {
    pageCount += 1;
    const { data: rows, error } = await supabaseAdmin
      .from(MESSAGES_TABLE)
      .select(tableSelectCols)
      .eq("session_id", sessionId)
      .order("date_time", { ascending: true })
      .range(offset, offset + MESSAGES_PAGE_SIZE - 1);

    if (error) {
      return { messages: [], error: error.message };
    }

    const page = rows ?? [];
    allRows.push(...(page as Record<string, unknown>[]));

    if (page.length < MESSAGES_PAGE_SIZE) {
      hasMore = false;
    } else {
      offset += MESSAGES_PAGE_SIZE;
    }
  }

  console.log(`[getConversationBySessionId] ${sessionId}: ${allRows.length} raw rows from chatbot_history`);
  const messages = allRows.map(rawRowToChatMessage);
  console.log(`[getConversationBySessionId] ${sessionId}: ${messages.length} messages after mapping, ids: ${messages.map(m => m.id).join(",")}`);
  return { messages };
}
