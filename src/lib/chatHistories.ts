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
    .select(
      "id, session_id, msg_type:message->>type, msg_content:message->>content, msg_body:message->>body, cust_name:customer->>name, cust_number:customer->>number, date_time"
    )
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

/**
 * Get all messages for a conversation, ordered by date_time ascending.
 * Uses ->> to extract only needed JSONB fields (avoids response truncation
 * when full JSONB blobs are included in select).
 */
export async function getConversationBySessionId(
  sessionId: string
): Promise<{ messages: ChatMessage[]; error?: string }> {
  if (!supabaseAdmin) {
    return { messages: [], error: "Supabase not configured" };
  }

  const { data: rows, error } = await supabaseAdmin
    .from("chatbot_history")
    .select(
      "id, session_id, msg_type:message->>type, msg_content:message->>content, msg_body:message->>body, cust_name:customer->>name, cust_number:customer->>number, date_time"
    )
    .eq("session_id", sessionId)
    .order("date_time", { ascending: true })
    .limit(10000);

  if (error) {
    return { messages: [], error: error.message };
  }

  const messages: ChatMessage[] = (rows ?? []).map((row: Record<string, unknown>) => {
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
  });

  return { messages };
}
