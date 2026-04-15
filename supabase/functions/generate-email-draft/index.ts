import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { systemPrompt, userPrompt } = await req.json();

    if (!systemPrompt || !userPrompt) {
      return jsonResponse({ error: "Missing systemPrompt or userPrompt" }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return jsonResponse({ error: "LOVABLE_API_KEY not configured" }, 500);
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1500,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.error(`[Email Draft] AI Gateway error: ${response.status} ${errBody}`);
      if (response.status === 429) {
        return jsonResponse({ error: "Rate limited, please try again later" }, 429);
      }
      if (response.status === 402) {
        return jsonResponse({ error: "AI credits exhausted" }, 402);
      }
      return jsonResponse({ error: "AI generation failed" }, 500);
    }

    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content;

    if (!content) {
      return jsonResponse({ error: "No content in AI response" }, 500);
    }

    const parsed = JSON.parse(content);
    return jsonResponse({
      subject: parsed.subject ?? "",
      body: parsed.body ?? "",
    });
  } catch (err) {
    console.error("[Email Draft] Error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
