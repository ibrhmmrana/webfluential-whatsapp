export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/server";
import { noIndexHeaders } from "@/lib/adminAuth";
import { sendWhatsAppMessage } from "@/lib/whatsapp/sender";
import { saveWhatsAppMessage } from "@/lib/whatsapp/messageStorage";

const SESSION_PREFIX = process.env.WHATSAPP_SESSION_ID_PREFIX ?? "APP-";

function buildSessionId(customerNumber: string): string {
  const digits = customerNumber.replace(/\D/g, "");
  return SESSION_PREFIX + digits;
}

export async function POST(request: NextRequest) {
  const headers = new Headers();
  Object.entries(noIndexHeaders()).forEach(([k, v]) => headers.set(k, v));

  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  let body: { message?: string; customerName?: string; customerNumber?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers });
  }

  const message = body.message?.trim();
  const customerNumber = body.customerNumber?.trim();
  if (!message || !customerNumber) {
    return NextResponse.json(
      { error: "message and customerNumber are required" },
      { status: 400, headers }
    );
  }

  const customer = {
    number: customerNumber.replace(/\D/g, ""),
    name: body.customerName?.trim() ?? undefined,
  };

  const sendResult = await sendWhatsAppMessage(customer.number, message);
  if (!sendResult.ok) {
    return NextResponse.json(
      { error: sendResult.error ?? "Failed to send message" },
      { status: 502, headers }
    );
  }

  const sessionId = buildSessionId(customerNumber);
  const saveResult = await saveWhatsAppMessage(sessionId, "ai", message, customer);
  if (saveResult.error) {
    return NextResponse.json(
      { error: saveResult.error ?? "Failed to save message" },
      { status: 500, headers }
    );
  }

  return NextResponse.json(
    { success: true, id: saveResult.id, date_time: saveResult.date_time },
    { headers }
  );
}
