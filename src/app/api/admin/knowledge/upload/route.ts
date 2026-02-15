export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/server";
import { noIndexHeaders } from "@/lib/adminAuth";
import { ingestKnowledge } from "@/lib/knowledge/ingest";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

function sourceFromFilename(name: string): string {
  return name
    .replace(/\.(md|pdf|docx?)$/i, "")
    .trim() || name;
}

function isPdf(name: string, type: string): boolean {
  return type === "application/pdf" || /\.pdf$/i.test(name);
}

function isWord(name: string, type: string): boolean {
  return (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    type === "application/msword" ||
    /\.(docx?)$/i.test(name)
  );
}

async function extractTextFromFile(
  buffer: Buffer,
  name: string,
  type: string
): Promise<string> {
  if (isPdf(name, type)) {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return result?.text?.trim() ?? "";
  }
  if (isWord(name, type)) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value?.trim() ?? "";
  }
  return buffer.toString("utf-8").trim();
}

export async function POST(request: NextRequest) {
  const headers = new Headers();
  Object.entries(noIndexHeaders()).forEach(([k, v]) => headers.set(k, v));

  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", reason: "Not signed in" },
      { status: 401, headers }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400, headers });
  }

  const sourceOverride = formData.get("source");
  const singleSource =
    typeof sourceOverride === "string" ? sourceOverride.trim() : null;

  const files = formData.getAll("files") as File[];
  if (!files.length) {
    return NextResponse.json(
      { error: "No files provided. Use the 'files' field." },
      { status: 400, headers }
    );
  }

  const results: { source: string; chunksInserted: number; error?: string }[] = [];

  if (singleSource) {
    const texts: string[] = [];
    for (const file of files) {
      if (!file?.name) continue;
      const buffer = Buffer.from(await file.arrayBuffer());
      const name = file.name;
      const type = file.type || "";
      try {
        const text = await extractTextFromFile(buffer, name, type);
        if (text) texts.push(text);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json(
          { error: `Failed to parse ${name}: ${msg}`, results: [] },
          { status: 500, headers }
        );
      }
    }
    const combined = texts.join("\n\n---\n\n");
    if (!combined.trim()) {
      return NextResponse.json(
        { error: "No text could be extracted from any file", results: [] },
        { status: 400, headers }
      );
    }
    const result = await ingestKnowledge(singleSource, combined);
    results.push({
      source: singleSource,
      chunksInserted: result.chunksInserted,
      error: result.error,
    });
  } else {
    for (const file of files) {
      if (!file?.name) continue;
      const buffer = Buffer.from(await file.arrayBuffer());
      const name = file.name;
      const type = file.type || "";

      let text: string;
      try {
        text = await extractTextFromFile(buffer, name, type);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ source: sourceFromFilename(name), chunksInserted: 0, error: msg });
        continue;
      }

      if (!text) {
        results.push({
          source: sourceFromFilename(name),
          chunksInserted: 0,
          error: "No text could be extracted",
        });
        continue;
      }

      const source = sourceFromFilename(name);
      const result = await ingestKnowledge(source, text);
      results.push({
        source,
        chunksInserted: result.chunksInserted,
        error: result.error,
      });
    }
  }

  const hasError = results.some((r) => r.error);
  return NextResponse.json(
    { success: !hasError, results },
    { status: hasError ? 500 : 200, headers }
  );
}
