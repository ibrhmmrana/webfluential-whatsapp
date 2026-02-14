export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// GET  /api/whatsapp/webhook — Meta webhook verification
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
  ) {
    console.log("[WhatsApp Webhook] Verification successful");
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn("[WhatsApp Webhook] Verification failed — token mismatch or bad mode");
  return new NextResponse("Forbidden", { status: 403 });
}

// ---------------------------------------------------------------------------
// POST /api/whatsapp/webhook — Incoming WhatsApp messages
// ---------------------------------------------------------------------------

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

/**
 * Try to extract the first text message from the three supported payload
 * formats. Returns `null` when nothing usable is found.
 */
function extractMessage(body: unknown): {
  waId: string;
  text: string;
} | null {
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
      if (value?.messages) {
        payload = value;
      }
    } catch {
      /* structure didn't match — fall through */
    }
  }

  // Format B — Direct array
  if (!payload && Array.isArray(body)) {
    try {
      const first = body[0] as MessagesPayload | undefined;
      if (first?.messages) {
        payload = first;
      }
    } catch {
      /* fall through */
    }
  }

  // Format C — Direct object
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

  // Find the first text message
  const msg = payload.messages.find((m) => m.type === "text");
  if (!msg?.text?.body) return null;

  // Prefer wa_id from contacts, fall back to `from`
  const waId =
    payload.contacts?.[0]?.wa_id ?? msg.from;

  return { waId, text: msg.text.body };
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const extracted = extractMessage(body);

    if (extracted) {
      const { waId, text } = extracted;
      console.log(`[WhatsApp Webhook] Message from ${waId}: ${text}`);

      // Reply "Received" via WhatsApp Cloud API
      const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

      if (phoneNumberId && accessToken) {
        try {
          const res = await fetch(
            `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: waId,
                type: "text",
                text: { body: "Received" },
              }),
            }
          );

          if (!res.ok) {
            const errBody = await res.text();
            console.error(
              `[WhatsApp Webhook] Failed to send reply (${res.status}): ${errBody}`
            );
          } else {
            console.log("[WhatsApp Webhook] Reply sent successfully");
          }
        } catch (sendErr) {
          console.error("[WhatsApp Webhook] Error sending reply:", sendErr);
        }
      } else {
        console.warn(
          "[WhatsApp Webhook] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN — skipping reply"
        );
      }
    } else {
      console.log("[WhatsApp Webhook] No actionable text message in payload");
    }
  } catch (err) {
    console.error("[WhatsApp Webhook] Error processing request:", err);
  }

  // Always return 200 so Meta doesn't retry
  return NextResponse.json({ status: "ok" }, { status: 200 });
}
