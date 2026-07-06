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

// Best-effort free website discovery via DuckDuckGo HTML.
// Skip hosts that are directories, socials, aggregators, gov/edu, or search engines.
const SEARCH_HOST_BLOCKLIST = [
  "facebook", "instagram", "linkedin", "twitter", "x.com", "yelp",
  "yellowpages", "truelocal", "hotfrog", "localsearch", "oneflare",
  "hipages", "productreview", "whitepages", "google", "bing",
  "wikipedia", "youtube", "tiktok", "gumtree", "indeed", "seek",
  "aircon-directory", "dnb.com", "australia247", "australiacheck",
  "cylex", "aussieweb", "startlocal", "purelocal", "womo",
  "serviceseeking", "findabusiness", "wordofmouth", "aircon",
  "brownbook", "tuugo", "cybo", "businesslist", "ezlocal",
  "fyple", "ailba", "zipleaf", "australianplanet",
];

function isBlockedSearchHost(host: string): boolean {
  const h = host.toLowerCase();
  if (/\.(gov|edu)(\.[a-z]{2})?$/.test(h)) return true;
  if (h.includes("directory") || h.includes("-listings") || h.includes("businessprofile")) return true;
  return SEARCH_HOST_BLOCKLIST.some((needle) => h.includes(needle));
}

function isRealBusinessName(name: string | null | undefined): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (trimmed.length < 3) return false;
  // Reject if it is only digits, spaces, punctuation, or a phone-shaped string.
  if (!/[A-Za-z]/.test(trimmed)) return false;
  if (/^[\d\s+()\-.]+$/.test(trimmed)) return false;
  return true;
}

/** Best-effort: search DuckDuckGo HTML for a business's real website. Never throws. */
async function findWebsiteViaSearch(
  businessName: string,
  city: string | null | undefined,
  state: string | null | undefined,
): Promise<string | null> {
  try {
    const parts = [businessName, city ?? "", state ?? "", "Australia"]
      .map((s) => (s ?? "").trim())
      .filter(Boolean);
    const query = parts.join(" ");
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    let html: string;
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
      html = await res.text();
    } finally {
      clearTimeout(timer);
    }

    // Extract candidate hrefs — both class="result__a" anchors and the raw
    // DuckDuckGo redirect links "/l/?uddg=..." or "//duckduckgo.com/l/?uddg=...".
    const hrefRe = /href=["']([^"']+)["']/gi;
    const candidates: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = hrefRe.exec(html)) !== null) {
      const raw = m[1];
      if (!raw) continue;
      // Only care about uddg redirects (DDG wraps every result this way).
      if (!raw.includes("uddg=")) continue;
      try {
        const abs = raw.startsWith("//") ? "https:" + raw : raw.startsWith("/") ? "https://duckduckgo.com" + raw : raw;
        const u = new URL(abs);
        const real = u.searchParams.get("uddg");
        if (!real) continue;
        const decoded = decodeURIComponent(real);
        candidates.push(decoded);
      } catch {
        // ignore malformed
      }
    }

    for (const cand of candidates) {
      let host: string;
      let normalized: string | null;
      try {
        const u = new URL(cand);
        host = u.host;
        normalized = `${u.protocol}//${u.host}`;
      } catch {
        continue;
      }
      if (!host || isBlockedSearchHost(host)) continue;
      // Confirm the candidate actually serves HTML.
      const probe = await fetchPage(normalized!);
      if (probe === null) continue;
      return normalized;
    }
    return null;
  } catch (err) {
    console.warn("[enrich-leads] search error:", (err as { message?: string })?.message ?? err);
    return null;
  }
}

// Free-mail domains — never treat as a business website.
const FREE_MAIL_DOMAINS = new Set<string>([
  "gmail.com", "hotmail.com", "hotmail.com.au", "outlook.com", "outlook.com.au",
  "live.com", "live.com.au", "yahoo.com", "yahoo.com.au", "bigpond.com",
  "bigpond.net.au", "icloud.com", "me.com", "msn.com", "aol.com", "ymail.com",
  "protonmail.com",
]);

// Trades that also populate contacts.trade_type when they come back as industry.
const TRADE_TYPES_SET = new Set<string>([
  "Plumbers", "HVAC", "Electricians", "Builders", "Renovators", "Roofers",
  "Landscaping", "Pest Control", "Auto Repair", "Painters", "Concreters",
  "Fencing", "Tilers", "Carpet Cleaning", "Cleaning Services", "Locksmiths",
  "Garage Doors", "Pool Builders", "Solar Installers", "Tree Services",
  "Removalists", "Demolition", "Pressure Washing", "Flooring",
  "Glass & Glazing", "Scaffolding", "Earthmoving", "Welding & Fabrication",
]);

function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.trim().toLowerCase().split("@");
  if (at.length !== 2 || !at[1]) return null;
  return at[1];
}

function isFreeMailDomain(domain: string): boolean {
  return FREE_MAIL_DOMAINS.has(domain.toLowerCase());
}

// AU mobile: 04XX XXX XXX or +61 4XX XXX XXX
const MOBILE_RE = /(?:\+?61[\s-]?|0)4\d{2}[\s-]?\d{3}[\s-]?\d{3}/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Name (2-3 caps words), optional comma, then role.
const NAME_ROLE_RE =
  /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}),?\s+(Owner|Director|Founder|Managing\s+Director|Principal|CEO)\b/g;
const HOMEOWNER_RE = /home[\s-]?owner/i;
const OWNER_KEYWORD_RE = /\b(owner|director|founder|principal|ceo|managing\s+director)\b/i;

// Reject any name whose tokens (case-insensitive) hit this stoplist — CMS accounts,
// web agencies, generic marketing/trade words, and location words that show up as
// junk "names" in scraped HTML.
const NAME_STOPLIST = new Set<string>([
  "admin", "digital", "agency", "marketing", "seo", "web", "website", "media",
  "design", "studio", "group", "solutions", "services", "service",
  "construction", "constructions", "plumbing", "electrical", "heating",
  "cooling", "air", "homeowner", "homeowners", "team", "company", "pty", "ltd",
  "home", "owners", "best", "local", "trusted", "expert", "experts", "quality",
  "google", "reviews", "testimonials", "contact", "about", "enquiries",
  "sydney", "melbourne", "brisbane", "perth", "adelaide", "canberra",
  "australia", "australian",
]);

// Strip a leading or trailing role word ("Founder Ray Glavinovic" -> "Ray Glavinovic")
const ROLE_STRIP_RE =
  /^(?:co[-\s]?founder|founder|owner|managing\s+director|director|principal|proprietor|ceo(?:\s*\/\s*founder)?)\s+|\s+(?:co[-\s]?founder|founder|owner|managing\s+director|director|principal|proprietor|ceo(?:\s*\/\s*founder)?)$/gi;

function cleanCandidateName(raw: string): string | null {
  if (!raw) return null;
  let name = raw.trim();
  // Drop trailing punctuation/comma clutter
  name = name.replace(/[,;:.\-–—]+$/g, "").trim();
  // Strip leading/trailing role words repeatedly
  for (let i = 0; i < 3; i++) {
    const next = name.replace(ROLE_STRIP_RE, "").trim();
    if (next === name) break;
    name = next;
  }
  if (!name) return null;
  if (HOMEOWNER_RE.test(name)) return null;

  const tokens = name.split(/\s+/);
  if (tokens.length < 2 || tokens.length > 3) return null;

  for (const tok of tokens) {
    if (!/^[A-Z][a-z]+$/.test(tok)) return null; // strict Title-case alpha
    if (NAME_STOPLIST.has(tok.toLowerCase())) return null;
  }
  return tokens.join(" ");
}

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

// JSON-LD is walked defensively: we only accept a name from a Person node reached
// through `founder`/`owner`, OR from a top-level Person entity. We do NOT walk
// `author`, `creator`, `employee`, `publisher`, `provider`, `sameAs` — those return
// the web agency that built the site (e.g. "LetsGo Digital") or generic team names.
function collectPersonNames(node: any, opts: { viaOwnerKey: boolean; topLevel: boolean }, out: { name?: string; telephone?: string }) {
  if (!node || out.name) return;
  if (Array.isArray(node)) {
    for (const n of node) collectPersonNames(n, opts, out);
    return;
  }
  if (typeof node !== "object") return;

  const type = node["@type"];
  const types = Array.isArray(type) ? type : [type];
  const isPerson = types.some((t) => typeof t === "string" && /Person/i.test(t));

  // Accept a Person's name only when reached via founder/owner, OR when this
  // Person is itself a top-level entity (some sites publish a bare Person block).
  if (isPerson && (opts.viaOwnerKey || opts.topLevel) && !out.name && typeof node.name === "string") {
    const cleaned = cleanCandidateName(node.name);
    if (cleaned) out.name = cleaned;
  }
  if (isPerson && !out.telephone && typeof node.telephone === "string") {
    out.telephone = node.telephone;
  }

  // Only recurse into the whitelisted owner/founder keys. Do NOT recurse into
  // `author`, `creator`, `employee`, `publisher`, `provider`, `sameAs`.
  for (const key of ["founder", "owner", "founders"]) {
    if (node[key]) collectPersonNames(node[key], { viaOwnerKey: true, topLevel: false }, out);
  }
  // Recurse through structural containers to reach nested Organizations that
  // may have their own `founder`/`owner`.
  for (const key of ["@graph", "mainEntity", "hasPart", "subOrganization", "parentOrganization"]) {
    if (node[key]) collectPersonNames(node[key], { viaOwnerKey: false, topLevel: false }, out);
  }
}

function extractFromHtml(html: string, siteHost: string, prev: ExtractResult, urlPath: string): ExtractResult {
  const out: ExtractResult = { ...prev };

  // 1. JSON-LD
  const ldBlocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  const hits: { name?: string; telephone?: string } = {};
  for (const block of ldBlocks) {
    const jsonText = block.replace(/^[\s\S]*?>/, "").replace(/<\/script>$/i, "").trim();
    try {
      const parsed = JSON.parse(jsonText);
      collectPersonNames(parsed, { viaOwnerKey: false, topLevel: true }, hits);
    } catch {
      // ignore malformed JSON-LD
    }
  }
  if (!out.name && hits.name) {
    out.name = hits.name;
    out.ownerAttributed = true;
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
      const cleaned = cleanCandidateName(m[1]);
      if (!cleaned) continue;
      out.name = cleaned;
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
              'You extract the single business owner, director, or founder from About/Contact page text. Return ONLY JSON: {"name": string|null}. The value must be a real individual person\'s full name — first name + last name (optionally middle) — exactly as written on the page. Return null (never guess) if the owner\'s personal name is not clearly stated. NEVER return: a company or brand name, an agency name, the web designer, a CMS username (e.g. "rskadmin"), a role title (e.g. "Founder", "Director"), the words "homeowner"/"homeowners", or a generic team/family label. Do NOT prepend or append the role — return just the person\'s name.',
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
    // Apply the same cleaning + stoplist + Title-case validation as the other paths.
    return cleanCandidateName(name);
  } catch (err) {
    console.warn("[enrich-leads] AI error:", err);
    return null;
  }
}

async function aiClassifyIndustry(
  signals: { businessName?: string | null; emailDomain?: string | null; homepageText?: string | null },
  apiKey: string,
): Promise<string | null> {
  const parts: string[] = [];
  if (signals.businessName) parts.push(`Business name: ${signals.businessName}`);
  if (signals.emailDomain) parts.push(`Email domain: ${signals.emailDomain}`);
  if (signals.homepageText) parts.push(`Website text (truncated):\n${signals.homepageText.slice(0, 4000)}`);
  const user = parts.join("\n\n").trim();
  if (!user) return null;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'You classify an Australian business into ONE service category for a sales dialer. Prefer a value from this list if it fits: Plumbers, HVAC, Electricians, Builders, Renovators, Roofers, Landscaping, Pest Control, Auto Repair, Painters, Concreters, Fencing, Tilers, Carpet Cleaning, Cleaning Services, Locksmiths, Garage Doors, Pool Builders, Solar Installers, Tree Services, Removalists, Flooring, Glass & Glazing, Dentists, Chiropractors, Physiotherapists, Real Estate, Accountants, Lawyers, Gyms & Fitness, Beauty & Salon, Cafe & Restaurant, Medical & Health, Professional Services. If none fit, return a concise 1-3 word service name. Return JSON {"service": string|null}. Return null if there is not enough information to tell (e.g. an individual with only a name/gmail and no business).',
          },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      console.warn(`[enrich-leads] AI classify ${res.status}`);
      return null;
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    const service = parsed?.service;
    if (typeof service !== "string") return null;
    const trimmed = service.trim();
    return trimmed ? trimmed : null;
  } catch (err) {
    console.warn("[enrich-leads] AI classify error:", err);
    return null;
  }
}

async function processContact(
  contact: {
    id: string;
    website: string | null;
    email: string | null;
    business_name: string | null;
    industry: string | null;
    city: string | null;
    state: string | null;
  },
  lovableApiKey: string | undefined,
): Promise<{
  mobile: string | null;
  email: string | null;
  name: string | null;
  ownerAttributed: boolean;
  source: "jsonld" | "regex" | "ai" | "none";
  resolvedWebsite: string | null;
  siteFromEmail: boolean;
  siteFromSearch: boolean;
  industry: string | null;
  homepageText: string | null;
  pagesFetched: number;
  ms: number;
}> {
  const start = Date.now();
  let base = contact.website ? normalizeWebsite(contact.website) : null;
  let siteFromEmail = false;
  let siteFromSearch = false;
  let resolvedWebsite: string | null = base;

  // Derive site from a business email domain when no website is set.
  if (!base && contact.email) {
    const dom = emailDomain(contact.email);
    if (dom && !isFreeMailDomain(dom)) {
      const candidate = `https://${dom}`;
      const probe = await fetchPage(candidate);
      if (probe !== null) {
        base = candidate;
        resolvedWebsite = candidate;
        siteFromEmail = true;
      }
    }
  }

  // Best-effort free website discovery via DuckDuckGo HTML — only when we still
  // have nothing and the business_name is real (not digits / a phone number).
  if (!base && isRealBusinessName(contact.business_name)) {
    const found = await findWebsiteViaSearch(contact.business_name!, contact.city, contact.state);
    if (found) {
      base = found;
      resolvedWebsite = found;
      siteFromSearch = true;
    }
  }

  if (!base) {
    // No site at all — still run industry classifier off business_name + email domain.
    let industryOnly: string | null = null;
    const needsIndustry =
      !contact.industry || contact.industry.trim() === "" || contact.industry.trim().toLowerCase() === "other";
    if (needsIndustry && lovableApiKey) {
      const dom = emailDomain(contact.email);
      industryOnly = await aiClassifyIndustry(
        {
          businessName: contact.business_name,
          emailDomain: dom && !isFreeMailDomain(dom) ? dom : null,
          homepageText: null,
        },
        lovableApiKey,
      );
    }
    return {
      mobile: null, email: null, name: null, ownerAttributed: false,
      source: "none", resolvedWebsite: null, siteFromEmail: false,
      siteFromSearch: false,
      industry: industryOnly, homepageText: null,
      pagesFetched: 0, ms: Date.now() - start,
    };
  }
  const host = new URL(base).host;

  let result: ExtractResult = { mobile: null, email: null, name: null, ownerAttributed: false, aboutTextForAi: null };
  let pagesFetched = 0;
  let sawJsonLd = false;
  let sawRegex = false;
  let homepageText: string | null = null;

  for (let i = 0; i < PATHS.length && pagesFetched < MAX_FETCHES; i++) {
    const url = base + PATHS[i];
    const html = await fetchPage(url);
    if (html === null) continue;
    pagesFetched++;
    if (PATHS[i] === "/" && !homepageText) {
      homepageText = stripHtml(html).slice(0, 4000);
    }
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

  // Industry classification — only when currently null or 'Other'.
  let industry: string | null = null;
  const needsIndustry =
    !contact.industry || contact.industry.trim() === "" || contact.industry.trim().toLowerCase() === "other";
  if (needsIndustry && lovableApiKey) {
    const dom = emailDomain(contact.email);
    industry = await aiClassifyIndustry(
      {
        businessName: contact.business_name,
        emailDomain: dom && !isFreeMailDomain(dom) ? dom : null,
        homepageText,
      },
      lovableApiKey,
    );
  }

  return {
    mobile: result.mobile,
    email: result.email,
    name: result.name,
    ownerAttributed: result.ownerAttributed,
    source,
    resolvedWebsite,
    siteFromEmail,
    siteFromSearch,
    industry,
    homepageText,
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
    .select("id, website, email, business_name, industry, trade_type, phone, phone_type, prospect_tier, dm_phone, dm_email, dm_name, best_route_to_decision_maker, city, state");

  if (forcedIds) {
    query = query.in("id", forcedIds);
  } else {
    query = query
      .eq("dm_enrich_attempted", false)
      .or("and(website.not.is.null,website.neq.),and(email.not.is.null,email.neq.),and(business_name.not.is.null,business_name.neq.)")
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
      .or("and(website.not.is.null,website.neq.),and(email.not.is.null,email.neq.),and(business_name.not.is.null,business_name.neq.)");
    remaining = Math.max((count ?? 0) - sorted.length, 0);
  }

  let mobiles_found = 0;
  let emails_found = 0;
  let names_found = 0;
  let websites_found = 0;
  const logs: any[] = [];

  const perContact = async (c: any) => {
    try {
      const r = await processContact({
        id: c.id,
        website: c.website,
        email: c.email,
        business_name: c.business_name,
        industry: c.industry,
        city: c.city,
        state: c.state,
      }, LOVABLE_API_KEY);

      // Source: 'search-website' if discovered via DDG, 'email-domain' if from
      // email domain, 'website' if we fetched an existing site, else 'ai-classify'.
      const enrichSource = r.siteFromSearch
        ? "search-website"
        : r.siteFromEmail
        ? "email-domain"
        : r.pagesFetched > 0
        ? "website"
        : "ai-classify";

      const update: Record<string, any> = {
        dm_enrich_attempted: true,
        dm_enriched_at: new Date().toISOString(),
        dm_enrich_source: enrichSource,
      };

      // If we resolved a site from email OR search, persist it to website.
      if ((r.siteFromEmail || r.siteFromSearch) && r.resolvedWebsite && (!c.website || c.website === "")) {
        update.website = r.resolvedWebsite;
        if (r.siteFromSearch) websites_found++;
      }

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

      // Industry classification write-back: only if current is null or 'Other'.
      if (r.industry) {
        const cur = (c.industry ?? "").trim().toLowerCase();
        if (!cur || cur === "other") {
          update.industry = r.industry.trim();
          if (TRADE_TYPES_SET.has(r.industry.trim()) && (!c.trade_type || c.trade_type === "")) {
            update.trade_type = r.industry.trim();
          }
        }
      }

      const { error: upErr } = await admin.from("contacts").update(update).eq("id", c.id);
      if (upErr) {
        console.error(`[enrich-leads] update ${c.id} failed:`, upErr.message);
      }

      const logLine = {
        contactId: c.id,
        website: c.website,
        resolved_website: r.resolvedWebsite,
        site_from_email: r.siteFromEmail,
        industry: r.industry,
        pages: r.pagesFetched,
        ms: r.ms,
        mobile: r.mobile,
        email: r.email,
        name: r.name,
        owner_attributed: r.ownerAttributed,
        source: r.source,
        enrich_source: enrichSource,
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
    websites_found,
    remaining,
    logs,
  });
});