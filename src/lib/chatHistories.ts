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

/**
 * List conversations: group by session_id, latest message, count. Sorted by last message desc.
 * Fetches in pages (newest first) so the first row seen per session is always the most recent message.
 */
export async function getConversations(): Promise<{
  conversations: ConversationSummary[];
  error?: string;
}> {
  if (!supabaseAdmin) {
    return { conversations: [], error: "Supabase not configured" };
  }

  const selectCols =
    "id, session_id, msg_type:message->>type, msg_content:message->>content, msg_body:message->>body, cust_name:customer->>name, cust_number:customer->>number, date_time";
  const allRows: Record<string, unknown>[] = [];
  let offset = 0;
  let pageCount = 0;

  while (pageCount < LIST_MAX_PAGES) {
    pageCount += 1;
    const { data: rows, error } = await supabaseAdmin
      .from("chatbot_history")
      .select(selectCols)
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
    const content = (row.msg_content as string) ?? (row.msg_body as string) ?? null;
    const isHuman = row.msg_type === "human";

    if (!existing) {
      bySession.set(sessionId, {
        lastMessageContent: content,
        lastMessageAt: row.date_time as string,
        lastId: row.id as number,
        lastCustomerMessageId: isHuman ? (row.id as number) : null,
        customerNumber: typeof row.cust_number === "string" ? row.cust_number : "",
        customerName: typeof row.cust_name === "string" ? row.cust_name : null,
        count: 1,
      });
    } else {
      existing.count += 1;
      // Rows are desc by date_time; first row per session is latest. If we didn't have a human message yet and this (older) row is human, use it as lastCustomerMessageId for unread — we want the latest human message id, so only set when we first see a human (which when iterating desc is the most recent human).
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
const selectCols =
  "id, session_id, msg_type:message->>type, msg_content:message->>content, msg_body:message->>body, cust_name:customer->>name, cust_number:customer->>number, date_time";

/**
 * Get the most recent N messages for a conversation (single query, fast).
 * Returns messages in chronological order (oldest first) for display.
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
    .from("chatbot_history")
    .select(selectCols)
    .eq("session_id", sessionId)
    .order("date_time", { ascending: false })
    .limit(cap);

  if (error) {
    return { messages: [], error: error.message };
  }

  const reversed = (rows ?? []).slice(0).reverse();
  const messages = (reversed as Record<string, unknown>[]).map(rowToChatMessage);
  return { messages };
}

/**
 * Get ALL messages for a conversation, ordered by date_time ascending.
 * Fetches in pages to avoid any response size/row limit; guarantees every
 * message for the session_id is returned.
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
      .from("chatbot_history")
      .select(selectCols)
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

  const messages = allRows.map(rowToChatMessage);
  return { messages };
}
