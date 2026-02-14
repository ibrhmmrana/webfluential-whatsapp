import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type MessageType = "human" | "ai";

export interface CustomerInfo {
  number: string;
  name?: string;
}

export interface MessageRecord {
  type: MessageType;
  content: string;
  additional_kwargs?: Record<string, unknown>;
  response_metadata?: Record<string, unknown>;
}

/**
 * Save a message to chatbot_history for dashboard and AI context.
 */
export async function saveWhatsAppMessage(
  sessionId: string,
  messageType: MessageType,
  content: string,
  customer: CustomerInfo,
  aiMetadata?: Record<string, unknown>
): Promise<{ id?: number; error?: string }> {
  if (!supabaseAdmin) {
    return { error: "Supabase not configured" };
  }

  const message: MessageRecord = {
    type: messageType,
    content,
    ...(aiMetadata && { response_metadata: aiMetadata }),
  };

  const { data, error } = await supabaseAdmin
    .from("chatbot_history")
    .insert({
      session_id: sessionId,
      message,
      customer: { number: customer.number, name: customer.name ?? undefined },
    })
    .select("id")
    .single();

  if (error) {
    return { error: error.message };
  }
  return { id: data?.id };
}
