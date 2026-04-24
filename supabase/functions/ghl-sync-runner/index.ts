import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ghlHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Version: GHL_VERSION,
  };
}

async function ghlFetch(
  path: string,
  apiKey: string,
  opts: { method?: string; body?: unknown } = {},
) {
  const init: RequestInit = {
    method: opts.method ?? "GET",
    headers: ghlHeaders(apiKey),
  };
  if (opts.body) init.body = JSON.stringify(opts.body);
  const res = await fetch(`${GHL_BASE}${path}`, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`GHL ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

interface UpsertPayload {
  phone: string;
  companyName?: string;
  name?: string;
  email?: string;
  website?: string;
  city?: string;
  state?: string;
  tags?: string[];
}

async function upsertContact(apiKey: string, locationId: string, payload: UpsertPayload) {
  const body: Record<string, unknown> = {
    locationId,
    phone: payload.phone,
    country: "AU",
    source: "Speedy Sales Dialer",
  };
  if (payload.name) {
    const parts = payload.name.trim().split(/\s+/);
    body.firstName = parts[0];
    if (parts.length > 1) body.lastName = parts.slice(1).join(" ");
  }
  if (payload.companyName) body.companyName = payload.companyName;
  if (payload.email) body.email = payload.email;
  if (payload.website) body.website = payload.website;
  if (payload.city) body.city = payload.city;
  if (payload.state) body.state = payload.state;
  const tags = [...(payload.tags ?? []), "dialer-linked"];
  body.tags = [...new Set(tags)];

  const data = await ghlFetch("/contacts/upsert", apiKey, { method: "POST", body });
  return { ghlContactId: data.contact?.id as string | undefined };
}

type SupaClient = ReturnType<typeof createClient>;

async function processBatch(
  supabase: SupaClient,
  apiKey: string,
  locationId: string,
  jobId: string,
  batchSize: number,
  offset: number,
  statusFilter: "active" | "all",
) {
  // Recount remaining each batch so progress reflects reality
  const countBuilder = supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .or("ghl_contact_id.is.null,ghl_contact_id.eq.")
    .not("phone", "is", null);
  if (statusFilter === "active") {
    countBuilder.in("status", ["dnc", "follow_up", "booked", "called"]);
  }
  const { count: remainingTotal } = await countBuilder;

  const fetchBuilder = supabase
    .from("contacts")
    .select("id, phone, business_name, contact_person, email, website, city, state, industry")
    .or("ghl_contact_id.is.null,ghl_contact_id.eq.")
    .not("phone", "is", null)
    .order("created_at", { ascending: true })
    .range(offset, offset + batchSize - 1);
  if (statusFilter === "active") {
    fetchBuilder.in("status", ["dnc", "follow_up", "booked", "called"]);
  }
  const { data: unlinked, error: fetchError } = await fetchBuilder;
  if (fetchError) throw new Error(`Fetch contacts failed: ${fetchError.message}`);

  if (!unlinked || unlinked.length === 0) {
    return { processed: 0, linked: 0, failed: 0, skipped: 0, hasMore: false, nextOffset: offset, total: remainingTotal ?? 0 };
  }

  let linked = 0;
  let failed = 0;
  let skipped = 0;

  for (const contact of unlinked) {
    if (!contact.phone || (contact.phone as string).trim() === "") {
      skipped++;
      continue;
    }
    try {
      const tags: string[] = [];
      if (contact.industry) tags.push(`industry:${(contact.industry as string).toLowerCase().replace(/\s+/g, "-")}`);
      const result = await upsertContact(apiKey, locationId, {
        phone: contact.phone as string,
        companyName: (contact.business_name as string) || undefined,
        name: ((contact.contact_person as string) || (contact.business_name as string)) || undefined,
        email: (contact.email as string) || undefined,
        website: (contact.website as string) || undefined,
        city: (contact.city as string) || undefined,
        state: (contact.state as string) || undefined,
        tags,
      });
      if (result.ghlContactId) {
        const { error: upErr } = await supabase
          .from("contacts")
          .update({ ghl_contact_id: result.ghlContactId })
          .eq("id", contact.id);
        if (upErr) {
          failed++;
          console.error(`[ghl-sync-runner] update failed for ${contact.id}:`, upErr.message);
        } else {
          linked++;
        }
      } else {
        failed++;
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ghl-sync-runner] upsert failed for ${contact.id}:`, msg);
      if (msg.includes("429")) {
        await new Promise((r) => setTimeout(r, 15000));
      }
    }
  }

  // linked rows now have ghl_contact_id and disappear from the unlinked pool, so advance only by skipped+failed
  const advance = skipped + failed;
  const remainingAfter = Math.max(0, (remainingTotal ?? 0) - linked);
  return {
    processed: unlinked.length,
    linked,
    failed,
    skipped,
    hasMore: remainingAfter > 0,
    nextOffset: offset + advance,
    total: remainingTotal ?? 0,
  };
}

async function runJob(jobId: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = Deno.env.get("GHL_API_KEY");
  const locationId = Deno.env.get("GHL_LOCATION_ID");
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  if (!apiKey || !locationId) {
    await supabase.from("ghl_sync_jobs").update({
      status: "failed",
      last_error: "GHL_API_KEY or GHL_LOCATION_ID is not configured",
      finished_at: new Date().toISOString(),
    }).eq("id", jobId);
    return;
  }

  // Load job
  const { data: job, error: jobErr } = await supabase
    .from("ghl_sync_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr || !job) {
    console.error("[ghl-sync-runner] job not found", jobId, jobErr);
    return;
  }

  await supabase.from("ghl_sync_jobs").update({
    status: "running",
    started_at: job.started_at ?? new Date().toISOString(),
    heartbeat_at: new Date().toISOString(),
  }).eq("id", jobId);

  let offset = job.current_offset as number;
  const batchSize = job.batch_size as number;
  const delayMs = job.delay_ms as number;
  const mode = job.mode as "active" | "all";

  let totalProcessed = job.processed as number;
  let totalLinked = job.linked as number;
  let totalFailed = job.failed as number;
  let totalSkipped = job.skipped as number;

  try {
    while (true) {
      // Cancellation check
      const { data: latest } = await supabase
        .from("ghl_sync_jobs")
        .select("status")
        .eq("id", jobId)
        .maybeSingle();
      if (!latest || latest.status === "cancelled") {
        await supabase.from("ghl_sync_jobs").update({
          status: "cancelled",
          finished_at: new Date().toISOString(),
        }).eq("id", jobId);
        return;
      }

      const t0 = performance.now();
      const result = await processBatch(supabase, apiKey, locationId, jobId, batchSize, offset, mode);
      const elapsed = Math.round(performance.now() - t0);

      totalProcessed += result.processed;
      totalLinked += result.linked;
      totalFailed += result.failed;
      totalSkipped += result.skipped;
      offset = result.nextOffset;

      await supabase.from("ghl_sync_jobs").update({
        current_offset: offset,
        processed: totalProcessed,
        linked: totalLinked,
        failed: totalFailed,
        skipped: totalSkipped,
        total: result.total,
        last_batch_ms: elapsed,
        heartbeat_at: new Date().toISOString(),
      }).eq("id", jobId);

      if (!result.hasMore || result.processed === 0) {
        await supabase.from("ghl_sync_jobs").update({
          status: "done",
          finished_at: new Date().toISOString(),
        }).eq("id", jobId);
        return;
      }

      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, Math.min(delayMs, 8000)));
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ghl-sync-runner] job failed", jobId, msg);
    await supabase.from("ghl_sync_jobs").update({
      status: "failed",
      last_error: msg,
      finished_at: new Date().toISOString(),
    }).eq("id", jobId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Authz: must be admin
    const { data: roleRow } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Forbidden — admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (action === "start") {
      const mode = body.mode === "all" ? "all" : "active";
      const batchSize = Math.min(Math.max(Number(body.batchSize) || 50, 1), 100);
      const delayMs = Math.min(Math.max(Number(body.delayMs) || 6000, 0), 30000);

      // Cancel any existing active job for this user (unique index would block insert)
      await adminClient
        .from("ghl_sync_jobs")
        .update({ status: "cancelled", finished_at: new Date().toISOString() })
        .eq("created_by", userId)
        .in("status", ["queued", "running"]);

      const { data: job, error: insErr } = await adminClient
        .from("ghl_sync_jobs")
        .insert({
          created_by: userId,
          mode,
          batch_size: batchSize,
          delay_ms: delayMs,
          status: "queued",
        })
        .select()
        .single();
      if (insErr || !job) {
        return json({ error: insErr?.message ?? "Failed to create job" }, 500);
      }

      // @ts-ignore EdgeRuntime is provided by Supabase Edge runtime
      EdgeRuntime.waitUntil(runJob(job.id));

      return json({ jobId: job.id, status: job.status });
    }

    if (action === "cancel") {
      const jobId = body.jobId as string | undefined;
      const query = adminClient
        .from("ghl_sync_jobs")
        .update({ status: "cancelled", finished_at: new Date().toISOString() })
        .eq("created_by", userId)
        .in("status", ["queued", "running"]);
      if (jobId) query.eq("id", jobId);
      const { error: cancelErr } = await query;
      if (cancelErr) return json({ error: cancelErr.message }, 500);
      return json({ ok: true });
    }

    if (action === "resume") {
      const { data: job } = await adminClient
        .from("ghl_sync_jobs")
        .select("*")
        .eq("created_by", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!job) return json({ error: "No job to resume" }, 404);
      if (!["running", "queued"].includes(job.status as string)) {
        return json({ error: "Job is not active" }, 400);
      }
      // @ts-ignore
      EdgeRuntime.waitUntil(runJob(job.id));
      return json({ jobId: job.id, status: job.status });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});
