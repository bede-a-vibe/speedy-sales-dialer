// Admin-only login links (17 Nov 2026). The dialer sends no emails, so an
// admin makes a one-time link here and sends it to the person themselves.
//   action "reset_link"   { user_id }                     -> a password reset link for an existing login
//   action "create_login" { email, display_name?, role? } -> creates the login, returns a set-password link
// The person opens the link and picks their own password on /reset-password.
// Nobody else ever sees or sets a password. Links are single use and expire.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ROLES = new Set(["admin", "coach", "sales_rep"]);
// Where the link lands. Only the dialer's own hosts are allowed.
const ALLOWED_ORIGINS = [/^https:\/\/speedydialer\.com$/, /^https:\/\/[a-z0-9-]+\.lovable\.app$/, /^http:\/\/localhost:\d+$/];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Who is asking: must be a signed-in admin.
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: who } = await userClient.auth.getUser();
  if (!who?.user) return json({ error: "Not signed in" }, 401);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: isAdmin, error: roleError } = await admin.rpc("has_role", { _user_id: who.user.id, _role: "admin" });
  if (roleError) return json({ error: roleError.message }, 500);
  if (!isAdmin) return json({ error: "Admins only" }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Bad request body" }, 400);
  }
  const origin = typeof body.origin === "string" ? body.origin : "";
  if (!ALLOWED_ORIGINS.some((re) => re.test(origin))) return json({ error: "Origin not allowed" }, 400);
  const redirectTo = `${origin}/reset-password`;

  // The link goes straight to the dialer's reset page with the hashed token,
  // and the page only uses it when the person clicks Continue. A plain
  // action_link is used up by whoever opens it first, and Slack's link
  // preview bot opened Lucas's link 12 seconds after it was posted (17 Nov).
  const recoveryLink = async (email: string) => {
    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
    if (error) throw error;
    return `${redirectTo}?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery`;
  };

  try {
    if (body.action === "reset_link") {
      const userId = typeof body.user_id === "string" ? body.user_id : "";
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error || !data?.user?.email) return json({ error: "No login found for that user" }, 404);
      return json({ email: data.user.email, link: await recoveryLink(data.user.email) });
    }

    if (body.action === "create_login") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email" }, 400);
      const displayName = typeof body.display_name === "string" && body.display_name.trim() ? body.display_name.trim() : undefined;
      const role = typeof body.role === "string" && ROLES.has(body.role) ? body.role : null;

      // No password is set here: the person sets it from the link.
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: displayName ? { display_name: displayName } : {},
      });
      if (createError) {
        const exists = /already|registered|exists/i.test(createError.message);
        return json({ error: exists ? "That email already has a login. Use Reset link on its row." : createError.message }, exists ? 409 : 400);
      }
      if (role && created.user) {
        const { error: grantError } = await admin.from("user_roles").insert({ user_id: created.user.id, role });
        if (grantError) return json({ error: `Login created but the role was not added: ${grantError.message}` }, 500);
      }
      return json({ email, user_id: created.user?.id, link: await recoveryLink(email) });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Could not make the link" }, 500);
  }
});
