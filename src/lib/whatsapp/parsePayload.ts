/**
 * Parse incoming Meta webhook payloads (multiple formats).
 * Returns waId, text, and optional customerName. Only supports type === 'text'.
 */

interface WhatsAppContact {
  wa_id: string;
  profile?: { name: string };
}

interface WhatsAppTextMessage {
  from: string;
  type: string;
  text?: { body: string };
}

interface MessagesPayload {
  contacts?: WhatsAppContact[];
  messages?: WhatsAppTextMessage[];
}

export interface ParsedIncomingMessage {
  waId: string;
  text: string;
  customerName?: string;
}

export function extractIncomingMessage(body: unknown): ParsedIncomingMessage | null {
  let payload: MessagesPayload | undefined;

  // Format A — Standard Meta Cloud API
  if (
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    "object" in body &&
    (body as Record<string, unknown>).object === "whatsapp_business_account"
  ) {
    try {
      const entry = (body as Record<string, unknown[]>).entry;
      const changes = (entry[0] as Record<string, unknown[]>).changes;
      const value = (changes[0] as Record<string, unknown>).value as MessagesPayload;
      if (value?.messages) payload = value;
    } catch {
      /* fall through */
    }
  }

  if (!payload && Array.isArray(body)) {
    try {
      const first = body[0] as MessagesPayload | undefined;
      if (first?.messages) payload = first;
    } catch {
      /* fall through */
    }
  }

  if (
    !payload &&
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    "messages" in body
  ) {
    payload = body as MessagesPayload;
  }

  if (!payload?.messages) return null;

  const msg = payload.messages.find((m) => m.type === "text");
  if (!msg?.text?.body) return null;

  const waId = payload.contacts?.[0]?.wa_id ?? msg.from;
  const customerName = payload.contacts?.[0]?.profile?.name;

  return {
    waId,
    text: msg.text.body,
    customerName: customerName ?? undefined,
  };
}
