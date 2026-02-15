import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const EMBEDDING_MODEL = "text-embedding-3-small";

export type KnowledgeMatch = {
  id: number;
  source: string;
  content: string;
  similarity: number;
};

/**
 * Embed the query and return top-k knowledge chunks by cosine similarity.
 */
export async function searchKnowledge(
  query: string,
  topK: number = 5
): Promise<KnowledgeMatch[]> {
  if (!supabaseAdmin) return [];

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return [];

  const trimmed = query.trim();
  if (!trimmed) return [];

  const openai = new OpenAI({ apiKey: openaiKey });
  const {
    data: [embeddingResult],
  } = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: trimmed,
  });

  const queryEmbedding = embeddingResult?.embedding;
  if (!queryEmbedding?.length) return [];

  const { data: rows, error } = await supabaseAdmin.rpc("match_knowledge", {
    query_embedding: queryEmbedding,
    match_count: topK,
  });

  if (error || !Array.isArray(rows)) return [];

  return rows.map((r: { id: number; source: string; content: string; similarity: number }) => ({
    id: r.id,
    source: r.source ?? "",
    content: r.content ?? "",
    similarity: typeof r.similarity === "number" ? r.similarity : 0,
  }));
}
