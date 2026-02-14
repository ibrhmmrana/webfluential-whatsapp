export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { extractIncomingMessage } from "@/lib/whatsapp/parsePayload";
import { isHumanInControl } from "@/lib/whatsapp/humanControl";
import { saveWhatsAppMessage } from "@/lib/whatsapp/messageStorage";
import { sendWhatsAppMessage } from "@/lib/whatsapp/sender";
import { processMessage } from "@/lib/whatsapp/aiAgent";
import { isNumberAllowedForAi } from "@/lib/whatsapp/aiModeSettings";

const SESSION_PREFIX = process.env.WHATSAPP_SESSION_ID_PREFIX ?? "APP-";

function buildSessionId(waId: string): string {
  const digits = waId.replace(/\D/g, "");
  return SESSION_PREFIX + digits;
}

// ---------------------------------------------------------------------------
// GET — Meta webhook verification
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
// POST — Incoming message: human check, save, AI (or skip), send reply, save
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const parsed = extractIncomingMessage(body);

    if (!parsed) {
      console.log("[WhatsApp Webhook] No actionable text message in payload");
      return NextResponse.json({ status: "ok" }, { status: 200 });
    }

    const { waId, text: messageText, customerName } = parsed;
    const sessionId = buildSessionId(waId);
    const customerNumber = waId.replace(/\D/g, "");
    const customer = { number: customerNumber, name: customerName };

    console.log(`[WhatsApp Webhook] Message from ${waId}: ${messageText}`);

    // Save incoming message to history
    await saveWhatsAppMessage(sessionId, "human", messageText, customer);

    const allowed = await isNumberAllowedForAi(customerNumber);
    if (!allowed) {
      console.log(`[WhatsApp Webhook] Number ${customerNumber} not allowed for AI — skipping reply`);
      return NextResponse.json(
        { status: "ok", message: "Number not allowed for AI" },
        { status: 200 }
      );
    }

    const humanInControl = await isHumanInControl(sessionId);

    if (humanInControl) {
      console.log("[WhatsApp Webhook] Human in control — AI skipped");
      return NextResponse.json(
        { status: "ok", message: "Human in control - AI skipped" },
        { status: 200 }
      );
    }

    // AI in control: call agent, send reply, save reply
    const { content: replyText } = await processMessage(
      sessionId,
      messageText,
      customerNumber,
      customerName
    );

    const sendResult = await sendWhatsAppMessage(waId, replyText);
    if (!sendResult.ok) {
      console.error("[WhatsApp Webhook] Failed to send reply:", sendResult.error);
    }

    await saveWhatsAppMessage(sessionId, "ai", replyText, customer);
  } catch (err) {
    console.error("[WhatsApp Webhook] Error processing request:", err);
  }

  return NextResponse.json({ status: "ok" }, { status: 200 });
}
