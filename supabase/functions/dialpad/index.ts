import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const DIALPAD_API_KEY = Deno.env.get("DIALPAD_API_KEY");
  if (!DIALPAD_API_KEY) {
    return new Response(
      JSON.stringify({ error: "DIALPAD_API_KEY is not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) {
    return new Response(
      JSON.stringify({ error: "SUPABASE_URL is not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseAnonKey) {
    return new Response(
      JSON.stringify({ error: "SUPABASE_ANON_KEY is not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Verify auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "No authorization header" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { action, ...params } = await req.json();
    const DIALPAD_BASE = "https://dialpad.com/api/v2";

    let dialpadResponse: Response;

    switch (action) {
      case "initiate_call": {
        dialpadResponse = await fetch(`${DIALPAD_BASE}/call`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${DIALPAD_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            phone_number: params.phone,
            user_id: params.dialpad_user_id,
          }),
        });
        break;
      }

      case "log_call": {
        const adminClient = createClient(supabaseUrl, serviceRoleKey);

        const { data: settings, error: settingsError } = await adminClient
          .from("dialpad_settings")
          .select("dialpad_user_id")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .maybeSingle();

        if (settingsError) {
          return new Response(
            JSON.stringify({ error: "Failed to fetch Dialpad settings", details: settingsError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const dialpadUserId = params.dialpad_user_id || settings?.dialpad_user_id;
        if (!dialpadUserId) {
          return new Response(
            JSON.stringify({ error: "No Dialpad user ID configured. Ask an admin to assign one." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        dialpadResponse = await fetch(`${DIALPAD_BASE}/call`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${DIALPAD_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            phone_number: params.phone,
            user_id: dialpadUserId,
          }),
        });
        break;
      }

      case "get_call_status": {
        dialpadResponse = await fetch(`${DIALPAD_BASE}/call/${params.call_id}`, {
          headers: { Authorization: `Bearer ${DIALPAD_API_KEY}` },
        });
        break;
      }

      case "list_calls": {
        const qs = new URLSearchParams();
        if (params.limit) qs.set("limit", params.limit);
        if (params.cursor) qs.set("cursor", params.cursor);
        dialpadResponse = await fetch(`${DIALPAD_BASE}/stats/calls?${qs}`, {
          headers: { Authorization: `Bearer ${DIALPAD_API_KEY}` },
        });
        break;
      }

      case "list_users": {
        const qs = new URLSearchParams();
        if (params.state) qs.set("state", params.state);
        if (params.office_id) qs.set("office_id", params.office_id);
        if (params.limit) qs.set("limit", String(params.limit));
        if (params.cursor) qs.set("cursor", params.cursor);
        const suffix = qs.toString() ? `?${qs}` : "";

        dialpadResponse = await fetch(`${DIALPAD_BASE}/users${suffix}`, {
          headers: {
            Authorization: `Bearer ${DIALPAD_API_KEY}`,
            Accept: "application/json",
          },
        });
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const data = await dialpadResponse.json();
    if (!dialpadResponse.ok) {
      return new Response(
        JSON.stringify({ error: `Dialpad API error [${dialpadResponse.status}]`, details: data }),
        { status: dialpadResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
