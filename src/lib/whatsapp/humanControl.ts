import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function isHumanInControl(sessionId: string): Promise<boolean> {
  if (!supabaseAdmin) return false;

  const { data, error } = await supabaseAdmin
    .from("whatsapp_human_control")
    .select("is_human_controlled")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error || !data) return false;
  return data.is_human_controlled === true;
}

export async function setHumanControl(
  sessionId: string,
  isHumanControlled: boolean
): Promise<{ error?: string }> {
  if (!supabaseAdmin) {
    return { error: "Supabase not configured" };
  }

  const { error } = await supabaseAdmin
    .from("whatsapp_human_control")
    .upsert(
      {
        session_id: sessionId,
        is_human_controlled: isHumanControlled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "session_id" }
    );

  return error ? { error: error.message } : {};
}
