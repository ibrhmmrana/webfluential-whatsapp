import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAIModeSettings, DEFAULT_SYSTEM_PROMPT } from "@/lib/whatsapp/aiModeSettings";
import { searchKnowledge } from "@/lib/knowledge/search";

const HISTORY_LIMIT = 20;
const KNOWLEDGE_TOP_K = 5;

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

  const settings = await getAIModeSettings();
  const systemPrompt = settings.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;

  const openai = new OpenAI({ apiKey: openaiKey });
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  // Retrieve relevant knowledge base chunks for RAG
  const knowledgeMatches = await searchKnowledge(userMessage, KNOWLEDGE_TOP_K);
  let systemContent = systemPrompt;
  if (knowledgeMatches.length > 0) {
    const contextText = knowledgeMatches.map((m) => m.content).join("\n\n");
    systemContent +=
      "\n\nUse the following knowledge base context to answer when relevant. If the context does not contain the answer, say you don't know.\n\n---\n\n" +
      contextText;
  }
  messages.push({ role: "system", content: systemContent });

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

  const model = settings.model?.trim() || "gpt-4o-mini";
  const completion = await openai.chat.completions.create({
    model,
    messages,
  });

  const content =
    completion.choices[0]?.message?.content?.trim() ??
    "I didn't get a response. Please try again.";

  return { content };
}
