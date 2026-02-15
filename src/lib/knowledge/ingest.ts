import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const EMBEDDING_MODEL = "text-embedding-3-small";
const BATCH_SIZE = 50;

/**
 * Split text into chunks on paragraph/sentence boundaries with overlap.
 */
export function chunkText(
  text: string,
  maxChars: number = 1500,
  overlap: number = 200
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < trimmed.length) {
    let end = Math.min(start + maxChars, trimmed.length);
    if (end < trimmed.length) {
      const slice = trimmed.slice(start, end);
      const lastPara = slice.lastIndexOf("\n\n");
      const lastSentence = Math.max(
        slice.lastIndexOf(". "),
        slice.lastIndexOf(".\n"),
        slice.lastIndexOf("? "),
        slice.lastIndexOf("! ")
      );
      const breakAt = Math.max(lastPara, lastSentence);
      if (breakAt > maxChars >> 1) {
        end = start + breakAt + 1;
      }
    }
    const chunk = trimmed.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    start = end - (end < trimmed.length ? overlap : 0);
    if (start <= 0 || start >= trimmed.length) break;
  }

  return chunks;
}

/**
 * Generate embeddings for multiple texts via OpenAI. Batches requests.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) throw new Error("OPENAI_API_KEY not set");

  const openai = new OpenAI({ apiKey: openaiKey });
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const { data } = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });
    const order = data
      .slice()
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((d) => d.embedding);
    allEmbeddings.push(...order);
  }

  return allEmbeddings;
}

/**
 * Ingest content under a source: chunk, embed, and insert into knowledge_base.
 * Replaces any existing chunks for this source (delete then insert).
 */
export async function ingestKnowledge(
  source: string,
  content: string
): Promise<{ chunksInserted: number; error?: string }> {
  if (!supabaseAdmin) return { chunksInserted: 0, error: "Supabase not configured" };

  const chunks = chunkText(content);
  if (chunks.length === 0) return { chunksInserted: 0 };

  let embeddings: number[][];
  try {
    embeddings = await generateEmbeddings(chunks);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { chunksInserted: 0, error: `Embeddings failed: ${msg}` };
  }

  const { error: deleteErr } = await deleteKnowledgeBySource(source);
  if (deleteErr) return { chunksInserted: 0, error: deleteErr };

  const rows = chunks.map((content, i) => ({
    source,
    content,
    embedding: embeddings[i] ?? [],
    metadata: null,
  }));

  const { error: insertErr } = await supabaseAdmin.from("knowledge_base").insert(rows);
  if (insertErr) return { chunksInserted: 0, error: insertErr.message };

  return { chunksInserted: chunks.length };
}

/**
 * Delete all chunks for a given source.
 */
export async function deleteKnowledgeBySource(source: string): Promise<{ error?: string }> {
  if (!supabaseAdmin) return { error: "Supabase not configured" };

  const { error } = await supabaseAdmin
    .from("knowledge_base")
    .delete()
    .eq("source", source);

  return error ? { error: error.message } : {};
}
