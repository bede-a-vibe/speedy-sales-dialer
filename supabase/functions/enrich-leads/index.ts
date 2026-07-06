// Enrich contacts by scraping their website for a mobile, email, and owner/director name.
// Called by pg_cron every minute (with x-enrich-secret header) and manually.
// verify_jwt = false — auth is via ENRICH_LEADS_SECRET header.

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

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const PATHS = ["/", "/contact", "/contact-us", "/about", "/about-us"];
const MAX_FETCHES = 4;
const FETCH_TIMEOUT_MS = 6000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const CONCURRENCY = 5;

// AU mobile: 04XX XXX XXX or +61 4XX XXX XXX
const MOBILE_RE = /(?:\+?61[\s-]?|0)4\d{2}[\s-]?\d{3}[\s-]?\d{3}/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Name (2-3 caps words), optional comma, then role.
const NAME_ROLE_RE =
  /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}),?\s+(Owner|Director|Founder|Managing\s+Director|Principal|CEO)\b/g;
const HOMEOWNER_RE = /home[\s-]?owner/i;
const OWNER_KEYWORD_RE = /\b(owner|director|founder|principal|ceo|managing\s+director)\b/i;

function normalizeAuMobile(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  let d = digits.replace(/^\+/, "");
  if (d.startsWith("61")) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  if (!/^4\d{8}$/.test(d)) return null;
  return `+61 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}

function looksLikeAssetEmail(email: string): boolean {
  const lower = email.toLowerCase();
  if (/(noreply|no-reply|donotreply|example|test@)/.test(lower)) return true;
  if (/\.(png|jpe?g|svg|gif|webp|ico|css|js)$/.test(lower)) return true;
  if (/(sentry|wixpress|cloudflare|godaddy|wordpress\.com)$/.test(lower.split("@")[1] ?? "")) return true;
  if (/^[a-f0-9]{16,}@/.test(lower)) return true; // sentry-style hashes
  return false;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWebsite(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let url = trimmed;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

async function fetchPage(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-AU,en;q=0.9",
      },
    });
    if (!res.ok) {
      try { await res.body?.cancel(); } catch { /* ignore */ }
      return null;
    }
    const ct = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(ct)) {
      try { await res.body?.cancel(); } catch { /* ignore */ }
      return null;
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_HTML_BYTES) return null;
    return new TextDecoder("utf-8", { fatal: false }).decode(buf);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type ExtractResult = {
  mobile: string | null;
  email: string | null;
  name: string | null;
  ownerAttributed: boolean;
  aboutTextForAi: string | null;
};

function walkJsonLd(node: any, hits: { name?: string; telephone?: string; ownerAttributed?: boolean }) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const n of node) walkJsonLd(n, hits);
    return;
  }
  if (typeof node !== "object") return;

  const type = node["@type"];
  const types = Array.isArray(type) ? type : [type];
  const isPerson = types.some((t) => typeof t === "string" && /Person/i.test(t));

  if (isPerson && !hits.name && typeof node.name === "string") {
    if (!HOMEOWNER_RE.test(node.name)) {
      hits.name = node.name.trim();
      hits.ownerAttributed = true;
    }
  }
  if (isPerson && !hits.telephone && typeof node.telephone === "string") {
    hits.telephone = node.telephone;
  }

  for (const key of ["founder", "owner", "author", "employee", "founders"]) {
    if (node[key]) {
      const before = hits.name;
      walkJsonLd(node[key], hits);
      if (!before && hits.name) hits.ownerAttributed = true;
    }
  }
  for (const v of Object.values(node)) {
    if (v && typeof v === "object") walkJsonLd(v, hits);
  }
}

function extractFromHtml(html: string, siteHost: string, prev: ExtractResult, urlPath: string): ExtractResult {
  const out: ExtractResult = { ...prev };

  // 1. JSON-LD
  const ldBlocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  const hits: { name?: string; telephone?: string; ownerAttributed?: boolean } = {};
  for (const block of ldBlocks) {
    const jsonText = block.replace(/^[\s\S]*?>/, "").replace(/<\/script>$/i, "").trim();
    try {
      const parsed = JSON.parse(jsonText);
      walkJsonLd(parsed, hits);
    } catch {
      // ignore malformed JSON-LD
    }
  }
  if (!out.name && hits.name) {
    out.name = hits.name;
    out.ownerAttributed = out.ownerAttributed || !!hits.ownerAttributed;
  }
  if (!out.mobile && hits.telephone) {
    const m = hits.telephone.match(MOBILE_RE)?.[0];
    if (m) {
      const norm = normalizeAuMobile(m);
      if (norm) {
        out.mobile = norm;
        out.ownerAttributed = true;
      }
    }
  }

  const text = stripHtml(html);

  // 2. Mobile regex
  if (!out.mobile) {
    const matches = text.match(MOBILE_RE) ?? [];
    for (const raw of matches) {
      const norm = normalizeAuMobile(raw);
      if (norm) {
        out.mobile = norm;
        // Check surrounding text for owner keyword
        const idx = text.indexOf(raw);
        if (idx >= 0) {
          const window = text.slice(Math.max(0, idx - 60), idx + raw.length + 60);
          if (OWNER_KEYWORD_RE.test(window) && !HOMEOWNER_RE.test(window)) {
            out.ownerAttributed = true;
          }
        }
        break;
      }
    }
  }

  // 3. Email
  if (!out.email) {
    const matches = text.match(EMAIL_RE) ?? [];
    // Prefer same-domain emails
    const sameDomain = matches.find((e) => e.toLowerCase().endsWith("@" + siteHost.replace(/^www\./, "")) && !looksLikeAssetEmail(e));
    const anyGood = matches.find((e) => !looksLikeAssetEmail(e));
    const picked = sameDomain ?? anyGood;
    if (picked) out.email = picked;
  }

  // 4. Name regex (skip if we already have it)
  if (!out.name) {
    let m: RegExpExecArray | null;
    NAME_ROLE_RE.lastIndex = 0;
    while ((m = NAME_ROLE_RE.exec(text)) !== null) {
      const fullMatch = m[0];
      const idx = m.index;
      const window = text.slice(Math.max(0, idx - 40), idx + fullMatch.length + 40);
      if (HOMEOWNER_RE.test(window)) continue;
      if (HOMEOWNER_RE.test(m[1])) continue;
      out.name = m[1].trim();
      out.ownerAttributed = true;
      break;
    }
  }

  // 5. Capture About/Contact text for AI fallback
  if (!out.aboutTextForAi && (urlPath.includes("about") || urlPath.includes("contact"))) {
    out.aboutTextForAi = text.slice(0, 6000);
  }

  return out;
}

async function aiExtractName(text: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'You extract the single business owner/director/founder\'s full name from About/Contact page text. Return JSON only: {"name": string|null}. Return null if not clearly stated. Never return the word "homeowner", "homeowners", or a generic role. Only return a real person\'s full name (first + last).',
          },
          { role: "user", content: text },
        ],
      }),
    });
    if (!res.ok) {
      console.warn(`[enrich-leads] AI ${res.status}`);
      return null;
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    const name = parsed?.name;
    if (typeof name !== "string" || !name.trim()) return null;
    if (HOMEOWNER_RE.test(name)) return null;
    if (!/\s/.test(name.trim())) return null; // require first + last
    return name.trim();
  } catch (err) {
    console.warn("[enrich-leads] AI error:", err);
    return null;
  }
}

async function processContact(
  contact: { id: string; website: string },
  lovableApiKey: string | undefined,
): Promise<{
  mobile: string | null;
  email: string | null;
  name: string | null;
  ownerAttributed: boolean;
  source: "jsonld" | "regex" | "ai" | "none";
  pagesFetched: number;
  ms: number;
}> {
  const start = Date.now();
  const base = normalizeWebsite(contact.website);
  if (!base) {
    return { mobile: null, email: null, name: null, ownerAttributed: false, source: "none", pagesFetched: 0, ms: Date.now() - start };
  }
  const host = new URL(base).host;

  let result: ExtractResult = { mobile: null, email: null, name: null, ownerAttributed: false, aboutTextForAi: null };
  let pagesFetched = 0;
  let sawJsonLd = false;
  let sawRegex = false;

  for (let i = 0; i < PATHS.length && pagesFetched < MAX_FETCHES; i++) {
    const url = base + PATHS[i];
    const html = await fetchPage(url);
    if (html === null) continue;
    pagesFetched++;
    const before = { name: result.name, mobile: result.mobile };
    result = extractFromHtml(html, host, result, PATHS[i]);
    if (!before.name && result.name && result.ownerAttributed) sawJsonLd = true;
    if (!before.mobile && result.mobile && result.ownerAttributed) sawJsonLd = true;
    if (!before.name && result.name && !sawJsonLd) sawRegex = true;
    // Short-circuit if we have both a confident name and a mobile
    if (result.name && result.mobile) break;
  }

  // AI fallback for name only
  let usedAi = false;
  if (!result.name && result.aboutTextForAi && lovableApiKey) {
    const aiName = await aiExtractName(result.aboutTextForAi, lovableApiKey);
    if (aiName) {
      result.name = aiName;
      usedAi = true;
    }
  }

  let source: "jsonld" | "regex" | "ai" | "none" = "none";
  if (usedAi) source = "ai";
  else if (sawJsonLd) source = "jsonld";
  else if (sawRegex || result.mobile || result.email) source = "regex";

  return {
    mobile: result.mobile,
    email: result.email,
    name: result.name,
    ownerAttributed: result.ownerAttributed,
    source,
    pagesFetched,
    ms: Date.now() - start,
  };
}

async function runInChunks<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    const results = await Promise.all(chunk.map(fn));
    out.push(...results);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const providedSecret = req.headers.get("x-enrich-secret") ?? "";
  const expectedSecret = Deno.env.get("ENRICH_LEADS_SECRET") ?? "";
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine
  }
  const batchSize = Math.min(Math.max(Number(body?.batchSize) || 25, 1), 50);
  const forcedIds: string[] | null = Array.isArray(body?.contactIds) && body.contactIds.length > 0 ? body.contactIds : null;

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Select batch
  let query = admin
    .from("contacts")
    .select("id, website, phone, phone_type, prospect_tier, dm_phone, dm_email, dm_name, best_route_to_decision_maker")
    .not("website", "is", null)
    .neq("website", "");

  if (forcedIds) {
    query = query.in("id", forcedIds);
  } else {
    query = query
      .eq("dm_enrich_attempted", false)
      .order("phone_type", { ascending: true }) // 'landline','mobile','unknown' — landlines first alphabetically anyway; JS sort below refines
      .order("created_at", { ascending: true })
      .limit(batchSize);
  }

  const { data: contacts, error: selErr } = await query;
  if (selErr) return json({ error: `Select failed: ${selErr.message}` }, 500);

  // Priority sort: non-mobile first, then Tier 1/2 first
  const tierRank = (t: string | null | undefined) =>
    t === "Tier 1 - Hot" ? 1 : t === "Tier 2 - Warm" ? 2 : 9;
  const sorted = [...(contacts ?? [])].sort((a, b) => {
    const aMob = a.phone_type === "mobile" ? 1 : 0;
    const bMob = b.phone_type === "mobile" ? 1 : 0;
    if (aMob !== bMob) return aMob - bMob;
    return tierRank(a.prospect_tier) - tierRank(b.prospect_tier);
  }).slice(0, batchSize);

  // Remaining count
  let remaining = 0;
  if (!forcedIds) {
    const { count } = await admin
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("dm_enrich_attempted", false)
      .not("website", "is", null)
      .neq("website", "");
    remaining = Math.max((count ?? 0) - sorted.length, 0);
  }

  let mobiles_found = 0;
  let emails_found = 0;
  let names_found = 0;
  const logs: any[] = [];

  const perContact = async (c: any) => {
    try {
      const r = await processContact({ id: c.id, website: c.website }, LOVABLE_API_KEY);

      const update: Record<string, any> = {
        dm_enrich_attempted: true,
        dm_enriched_at: new Date().toISOString(),
        dm_enrich_source: "website",
      };

      if (r.mobile && (!c.dm_phone || c.dm_phone === "")) {
        update.dm_phone = r.mobile;
        update.dm_phone_type = "mobile";
        mobiles_found++;
      }
      if (r.email && (!c.dm_email || c.dm_email === "")) {
        update.dm_email = r.email;
        emails_found++;
      }
      if (r.name && (!c.dm_name || c.dm_name === "")) {
        update.dm_name = r.name;
        names_found++;
      }
      if (r.mobile && (!c.dm_phone || c.dm_phone === "") && !c.best_route_to_decision_maker) {
        update.best_route_to_decision_maker = r.ownerAttributed
          ? "Website mobile (owner-attributed)"
          : "Website mobile (may be general line — ask for owner)";
      }

      const { error: upErr } = await admin.from("contacts").update(update).eq("id", c.id);
      if (upErr) {
        console.error(`[enrich-leads] update ${c.id} failed:`, upErr.message);
      }

      const logLine = {
        contactId: c.id,
        website: c.website,
        pages: r.pagesFetched,
        ms: r.ms,
        mobile: r.mobile,
        email: r.email,
        name: r.name,
        owner_attributed: r.ownerAttributed,
        source: r.source,
      };
      console.log(`[enrich-leads] ${JSON.stringify(logLine)}`);
      logs.push(logLine);
    } catch (err: any) {
      console.error(`[enrich-leads] contact ${c.id} threw:`, err?.message ?? err);
      // Still mark attempted so it doesn't loop
      await admin.from("contacts").update({
        dm_enrich_attempted: true,
        dm_enriched_at: new Date().toISOString(),
        dm_enrich_source: "website",
      }).eq("id", c.id);
      logs.push({ contactId: c.id, error: String(err?.message ?? err) });
    }
  };

  await runInChunks(sorted, CONCURRENCY, perContact);

  return json({
    processed: sorted.length,
    mobiles_found,
    emails_found,
    names_found,
    remaining,
    logs,
  });
});