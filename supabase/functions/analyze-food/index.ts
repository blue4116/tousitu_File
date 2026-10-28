// Supabase Edge Function: analyze-food
// Configure an AI provider secret with `supabase secrets set AI_API_KEY=...`.
// Replace the provider endpoint/model below with the AI provider you choose.
// Do not place AI_API_KEY in app.js or any GitHub Pages client file.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization") || "";
  const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return json({ error: "ログインが必要です。" }, 401);

  const aiKey = Deno.env.get("AI_API_KEY");
  if (!aiKey) return json({ error: "AI_API_KEYがサーバーに設定されていません。READMEの手順を確認してください。" }, 503);

  try {
    const form = await req.formData();
    const photo = form.get("photo");
    const description = String(form.get("description") || "");
    const seasoningNote = String(form.get("seasoning_note") || "");
    if (!(photo instanceof File) || !photo.type.startsWith("image/")) return json({ error: "食事写真を選択してください。" }, 400);
    if (photo.size > 8 * 1024 * 1024) return json({ error: "写真は8MB以下にしてください。" }, 400);

    // Provider adapter placeholder. Implement this request for the selected vision-capable AI provider.
    // Expected JSON output:
    // {dish_name, calories_kcal, carbs_g, protein_g, fat_g, fiber_g, notes}
    // The provider should distinguish image-estimated food from user-entered seasoning.
    // Avoid claiming exact quantities; return ranges/uncertainty in notes when possible.
    // This stub intentionally fails closed rather than pretending an estimate was performed.
    return json({
      error: "AIプロバイダーの接続部分が未設定です。READMEの「写真分析AIを接続する」を完了してください。",
      received: {
        image_type: photo.type,
        image_size_bytes: photo.size,
        description_received: Boolean(description),
        seasoning_note_received: Boolean(seasoningNote)
      }
    }, 501);
  } catch (_e) {
    return json({ error: "画像の処理に失敗しました。" }, 400);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
