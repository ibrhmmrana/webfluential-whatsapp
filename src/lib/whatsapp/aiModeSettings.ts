import { supabaseAdmin } from "@/lib/supabaseAdmin";

const KEY = "whatsapp_ai";

export type AIModeSettings = {
  devMode: boolean;
  allowedNumbers: string[];
  systemPrompt: string;
  model: string;
};

const DEFAULT_ALLOWED = (process.env.WHATSAPP_ALLOWED_AI_NUMBER ?? "27693475825")
  .replace(/\D/g, "");

export const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful WhatsApp assistant. Be concise and professional. If you don't know something or the user asks for a human, say so.";

export const DEFAULT_MODEL = "gpt-4o-mini";

const DEFAULTS: AIModeSettings = {
  devMode: true,
  allowedNumbers: DEFAULT_ALLOWED ? [DEFAULT_ALLOWED] : [],
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  model: DEFAULT_MODEL,
};

/** Normalize to digits only (e.g. 27693475825). */
export function normalizeNumber(num: string): string {
  return num.replace(/\D/g, "");
}

/**
 * Get current AI mode settings from DB.
 * Live mode = AI replies to everyone. Dev mode = only allowed numbers.
 */
export async function getAIModeSettings(): Promise<AIModeSettings> {
  if (!supabaseAdmin) return DEFAULTS;

  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", KEY)
    .maybeSingle();

  if (error || !data?.value) return DEFAULTS;

  const v = data.value as {
    devMode?: boolean;
    allowedNumbers?: string[];
    systemPrompt?: string;
    model?: string;
  };
  const allowed = Array.isArray(v.allowedNumbers)
    ? v.allowedNumbers.map(normalizeNumber).filter(Boolean)
    : DEFAULTS.allowedNumbers;
  const systemPrompt =
    typeof v.systemPrompt === "string" && v.systemPrompt.trim()
      ? v.systemPrompt.trim()
      : DEFAULTS.systemPrompt;
  const model =
    typeof v.model === "string" && v.model.trim() ? v.model.trim() : DEFAULTS.model;
  return {
    devMode: typeof v.devMode === "boolean" ? v.devMode : DEFAULTS.devMode,
    allowedNumbers: allowed.length ? allowed : DEFAULTS.allowedNumbers,
    systemPrompt,
    model,
  };
}

/**
 * Update AI mode settings. allowedNumbers stored as digits only.
 */
export async function setAIModeSettings(
  update: Partial<AIModeSettings>
): Promise<{ error?: string }> {
  if (!supabaseAdmin) return { error: "Supabase not configured" };

  const current = await getAIModeSettings();
  const next: AIModeSettings = {
    devMode: typeof update.devMode === "boolean" ? update.devMode : current.devMode,
    allowedNumbers: update.allowedNumbers !== undefined
      ? (Array.isArray(update.allowedNumbers) ? update.allowedNumbers : [])
          .map(normalizeNumber)
          .filter(Boolean)
      : current.allowedNumbers,
    systemPrompt:
      update.systemPrompt !== undefined
        ? (typeof update.systemPrompt === "string" ? update.systemPrompt : "").trim() || current.systemPrompt
        : current.systemPrompt,
    model:
      update.model !== undefined
        ? (typeof update.model === "string" ? update.model : "").trim() || DEFAULTS.model
        : current.model,
  };

  const { error } = await supabaseAdmin
    .from("app_settings")
    .upsert(
      { key: KEY, value: next, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );

  return error ? { error: error.message } : {};
}

/**
 * Returns true if the given number (digits) is allowed to receive AI replies.
 * Live mode: everyone allowed. Dev mode: only numbers in allowedNumbers.
 */
export async function isNumberAllowedForAi(waIdDigits: string): Promise<boolean> {
  const settings = await getAIModeSettings();
  if (!settings.devMode) return true; // Live: reply to everyone
  const normalized = normalizeNumber(waIdDigits);
  return normalized.length > 0 && settings.allowedNumbers.includes(normalized);
}
