import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const HISTORY_LIMIT = 20;

export interface ProcessMessageResult {
  content: string;
}

export async function processMessage(
  sessionId: string,
  userMessage: string,
  customerPhone?: string,
  customerName?: string
): Promise<ProcessMessageResult> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return { content: "Sorry, the assistant is not configured. Please try again later." };
  }

  const openai = new OpenAI({ apiKey: openaiKey });
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  // System message
  messages.push({
    role: "system",
    content:
      "You are a helpful WhatsApp assistant. Be concise and professional. If you don't know something or the user asks for a human, say so.",
  });

  // Load last N messages from chatbot_history
  if (supabaseAdmin) {
    const { data: rows } = await supabaseAdmin
      .from("chatbot_history")
      .select("message")
      .eq("session_id", sessionId)
      .order("date_time", { ascending: true })
      .limit(HISTORY_LIMIT);

    if (rows?.length) {
      for (const row of rows) {
        const msg = row.message as { type?: string; content?: string };
        if (!msg?.content) continue;
        const role = msg.type === "human" ? "user" : "assistant";
        messages.push({ role, content: msg.content });
      }
    }
  }

  // Current user message
  messages.push({ role: "user", content: userMessage });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
  });

  const content =
    completion.choices[0]?.message?.content?.trim() ??
    "I didn't get a response. Please try again.";

  return { content };
}
