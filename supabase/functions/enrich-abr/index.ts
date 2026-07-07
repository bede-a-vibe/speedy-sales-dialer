// Enrich contacts from the Australian Business Register (ABR) free web-services JSON API.
// STAGED: fully inert until the ABR_GUID secret is set — the function no-ops cleanly.
// Called by pg_cron (with x-enrich-secret header) and manually.
// verify_jwt = false — auth is via ENRICH_LEADS_SECRET header (same as enrich-leads).

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-enrich-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const FETCH_TIMEOUT_MS = 8000;
// Gentle throttle between per-lead ABR calls (respects ABR rate guidance).
const PER_LEAD_DELAY_MS = 350;

const AU_STATES = new Set(["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"]);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Strip the JSONP `callback({...})` wrapper and JSON.parse the payload. Never throws. */
function parseJsonp(text: string): any | null {
  if (!text) return null;
  try {
    // Match the outermost `name(  ... )` — ABR uses `callback({...})`.
    const first = text.indexOf("(");
    const last = text.lastIndexOf(")");
    if (first < 0 || last < 0 || last <= first) {
      // Some responses may already be plain JSON.
      try { return JSON.parse(text); } catch { return null; }
    }
    const inner = text.slice(first + 1, last).trim();
    if (!inner) return null;
    return JSON.parse(inner);
  } catch {
    return null;
  }
}

async function abrFetch(url: string): Promise<any | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SpeedyDialerBot/1.0)",
        Accept: "text/javascript, application/json, */*",
      },
    });
    if (!res.ok) {
      try { await res.body?.cancel(); } catch { /* ignore */ }
      return null;
    }
    const text = await res.text();
    return parseJsonp(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Normalise a business name for fuzzy comparison. */
function normName(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/\b(pty\.?|ltd\.?|limited|the|and|&|co\.?|company|group|australia|aust\.?|inc\.?|holdings|trust|services|solutions)\b/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Token-based similarity in [0..1]. Simple Jaccard on words >= 2 chars. */
function nameSimilarity(a: string, b: string): number {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = new Set(na.split(" ").filter((w) => w.length >= 2));
  const tb = new Set(nb.split(" ").filter((w) => w.length >= 2));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function normState(s: string | null | undefined): string | null {
  if (!s) return null;
  const up = s.trim().toUpperCase();
  if (AU_STATES.has(up)) return up;
  // Map full names occasionally returned by ABR.
  const map: Record<string, string> = {
    "NEW SOUTH WALES": "NSW",
    "VICTORIA": "VIC",
    "QUEENSLAND": "QLD",
    "WESTERN AUSTRALIA": "WA",
    "SOUTH AUSTRALIA": "SA",
    "TASMANIA": "TAS",
    "AUSTRALIAN CAPITAL TERRITORY": "ACT",
    "NORTHERN TERRITORY": "NT",
  };
  return map[up] ?? null;
}

/** Looks like a person's name (2–4 words, alphabetic, Title-case-friendly). */
function looksLikePersonName(s: string | null | undefined): boolean {
  if (!s) return false;
  const t = s.trim();
  if (t.length < 4 || t.length > 60) return false;
  // Reject anything with company markers.
  if (/\b(pty|ltd|limited|inc|holdings|group|trust|company|co\.|services|solutions|the |&)\b/i.test(t)) return false;
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return false;
  // ABR often returns "SURNAME, Firstname" — accept comma form too.
  const stripped = t.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  return /^[A-Za-z][A-Za-z' \-]+$/.test(stripped);
}

/** ABR returns "SURNAME, Firstname Middle" — reformat to Title-case "Firstname Middle Surname". */
function humanizePersonName(raw: string): string {
  const clean = raw.replace(/\s+/g, " ").trim();
  const titled = (w: string) =>
    w
      .toLowerCase()
      .replace(/(^|[\s'\-])([a-z])/g, (_m, s, c) => s + c.toUpperCase());
  if (clean.includes(",")) {
    const [surname, rest] = clean.split(",", 2);
    const first = (rest ?? "").trim();
    return titled(`${first} ${surname}`.trim());
  }
  return titled(clean);
}

type MatchingName = {
  Abn?: string;
  Name?: string;
  Score?: number;
  State?: string;
  Postcode?: string;
  IsCurrent?: boolean;
  NameType?: string;
};

type BestMatch = {
  abn: string;
  name: string;
  state: string | null;
  score: number;
  similarity: number;
};

function pickBestMatch(
  candidates: MatchingName[],
  businessName: string,
  leadState: string | null,
): BestMatch | null {
  let best: BestMatch | null = null;
  for (const c of candidates) {
    if (!c?.Abn || !c?.Name) continue;
    const cState = normState(c.State);
    // If the lead has a state, require agreement.
    if (leadState && cState && cState !== leadState) continue;
    const sim = nameSimilarity(businessName, c.Name);
    if (sim < 0.55) continue;
    const score = (c.Score ?? 0) / 100 + sim + (c.IsCurrent ? 0.1 : 0);
    if (!best || score > best.score) {
      best = { abn: c.Abn, name: c.Name, state: cState, score, similarity: sim };
    }
  }
  return best;
}

async function processLead(
  admin: any,
  lead: { id: string; business_name: string; state: string | null; dm_name: string | null },
  guid: string,
): Promise<{ matched: boolean; wroteState: boolean; wroteName: boolean; wroteAbn: boolean }> {
  const q = encodeURIComponent(lead.business_name.trim());
  const matchUrl =
    `https://abr.business.gov.au/json/MatchingNames.aspx?name=${q}&maxResults=10&guid=${encodeURIComponent(guid)}`;
  const matchPayload = await abrFetch(matchUrl);
  const names: MatchingName[] = Array.isArray(matchPayload?.Names) ? matchPayload.Names : [];
  const leadState = normState(lead.state);
  const best = pickBestMatch(names, lead.business_name, leadState);
  if (!best) return { matched: false, wroteState: false, wroteName: false, wroteAbn: false };

  const detailsUrl =
    `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${encodeURIComponent(best.abn)}&guid=${encodeURIComponent(guid)}`;
  const details = await abrFetch(detailsUrl);
  if (!details || !details.Abn) {
    // Still write the ABN we matched so it's not re-tried, plus state if we got one.
    const upd: Record<string, any> = {};
    if (!lead.state && best.state) upd.state = best.state;
    upd.abn = best.abn;
    if (Object.keys(upd).length) {
      try { await admin.from("contacts").update(upd).eq("id", lead.id); } catch { /* ignore */ }
    }
    return {
      matched: true,
      wroteState: !!upd.state,
      wroteName: false,
      wroteAbn: true,
    };
  }

  const upd: Record<string, any> = { abn: details.Abn };
  const detailState = normState(details.AddressState);
  if (!lead.state && detailState) upd.state = detailState;

  // Only fill dm_name when EntityTypeCode indicates an individual/sole trader.
  const entityCode = String(details.EntityTypeCode ?? "").toUpperCase();
  const entityName = String(details.EntityName ?? "").trim();
  if (!lead.dm_name && entityCode === "IND" && entityName) {
    const human = humanizePersonName(entityName);
    if (looksLikePersonName(human)) upd.dm_name = human;
  }

  try { await admin.from("contacts").update(upd).eq("id", lead.id); } catch { /* ignore */ }
  return {
    matched: true,
    wroteState: !!upd.state,
    wroteName: !!upd.dm_name,
    wroteAbn: true,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const providedSecret = req.headers.get("x-enrich-secret") ?? "";
  const expectedSecret = Deno.env.get("ENRICH_LEADS_SECRET") ?? "";
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  // ── Staged / inert gate ──
  // Until an ABR web-services GUID is provisioned, the drain is a no-op.
  const ABR_GUID = Deno.env.get("ABR_GUID") ?? "";
  if (!ABR_GUID) {
    return json({ ok: true, staged: true, note: "ABR_GUID not set — enrich-abr is inert." });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const batchSize = Math.min(Math.max(Number(body?.batchSize) || 50, 1), 100);
  const forcedIds: string[] | null =
    Array.isArray(body?.contactIds) && body.contactIds.length > 0 ? body.contactIds : null;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Selection: leads with a business_name AND (state missing OR dm_name missing),
  // not yet attempted by the ABR drain.
  let sel = admin
    .from("contacts")
    .select("id, business_name, state, dm_name");
  if (forcedIds) {
    sel = sel.in("id", forcedIds);
  } else {
    sel = sel
      .not("business_name", "is", null)
      .neq("business_name", "")
      .eq("abr_attempted", false)
      .or("state.is.null,dm_name.is.null")
      .order("created_at", { ascending: true })
      .limit(batchSize);
  }

  const { data: leads, error: selErr } = await sel;
  if (selErr) return json({ error: `select failed: ${selErr.message}` }, 500);
  if (!leads || leads.length === 0) {
    return json({ ok: true, processed: 0, matched: 0, remaining: 0 });
  }

  let matched = 0, wroteState = 0, wroteName = 0, wroteAbn = 0, errored = 0;

  for (const lead of leads) {
    try {
      const r = await processLead(admin, lead as any, ABR_GUID);
      if (r.matched) matched++;
      if (r.wroteState) wroteState++;
      if (r.wroteName) wroteName++;
      if (r.wroteAbn) wroteAbn++;
    } catch {
      errored++;
    }
    // Mark attempted regardless of outcome so leads aren't re-tried forever.
    try {
      await admin.from("contacts").update({ abr_attempted: true }).eq("id", (lead as any).id);
    } catch { /* ignore */ }
    await sleep(PER_LEAD_DELAY_MS);
  }

  let remaining = 0;
  if (!forcedIds) {
    const { count } = await admin
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .not("business_name", "is", null)
      .neq("business_name", "")
      .eq("abr_attempted", false)
      .or("state.is.null,dm_name.is.null");
    remaining = Math.max((count ?? 0) - leads.length, 0);
  }

  return json({
    ok: true,
    processed: leads.length,
    matched,
    wroteState,
    wroteName,
    wroteAbn,
    errored,
    remaining,
  });
});