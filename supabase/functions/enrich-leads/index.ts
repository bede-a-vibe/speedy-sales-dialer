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
// Deep-crawl parameters: homepage + up to 4 secondary owner-likely pages, cap 5.
const DEEP_MAX_PAGES = 5;
const DEEP_CANDIDATE_PATHS = [
  "/about", "/about-us", "/our-team", "/team",
  "/meet-the-team", "/meet-our-team", "/our-story",
  "/contact", "/contact-us", "/staff", "/people",
];
const DEEP_LINK_HREF_RE = /\/(about|team|our-story|our-team|meet[-a-z]*|contact|staff|people)(\/|$|\?|#)/i;
const DEEP_LINK_TEXT_RE = /\b(about|team|our story|meet (?:the |our )?team|contact|staff|people)\b/i;
const FETCH_TIMEOUT_MS = 6000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const CONCURRENCY = 5;
// Deep-crawl runs one fetch per candidate page against a *different* domain per
// lead, so we can safely raise concurrency without hammering any single site.
// Sized so a 40-lead batch finishes well inside the edge-function time budget.
const DEEP_CONCURRENCY = 11;

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

// Extra name-source patterns (deep crawl). Each capture group holds the name.
// Cleaned via cleanCandidateName; matches near a role word are preferred.
const OWNER_LEAD_RE =
  /\b(?:Owner|Director|Founder|Principal|Proprietor|Managing\s+Director)\s*[:\-\u2013\u2014]\s*([A-Z][A-Za-z''\-]+(?:\s+[A-Z][A-Za-z''\-]+){1,2})/g;
const NAME_TRAIL_ROLE_RE =
  /\b([A-Z][A-Za-z''\-]+(?:\s+[A-Z][A-Za-z''\-]+){1,2}),\s+(?:Owner|Director|Founder|Principal|Proprietor|Managing\s+Director)\b/g;
const MEET_NAME_RE = /\bMeet\s+([A-Z][A-Za-z''\-]+(?:\s+[A-Z][A-Za-z''\-]+){1,2})\b/g;
const HI_IM_RE = /\b(?:Hi[,!]?\s+I['\u2019]m|I['\u2019]m)\s+([A-Z][A-Za-z''\-]+(?:\s+[A-Z][A-Za-z''\-]+){0,2})(?:\s+and\b|[,.!])/g;
const HEADING_NAME_RE =
  /<h[234][^>]*>\s*([A-Z][A-Za-z''\-]+(?:\s+[A-Z][A-Za-z''\-]+){1,2})\s*<\/h[234]>/g;

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
  /^(?:co[-\s]?founders?|founders?|owners?|managing\s+directors?|directors?|principals?|proprietors?|ceo(?:\s*\/\s*founder)?)\s+|\s+(?:co[-\s]?founders?|founders?|owners?|managing\s+directors?|directors?|principals?|proprietors?|ceo(?:\s*\/\s*founder)?)$/gi;

// Website template placeholder names — reject case-insensitively. These are
// dummy names shipped in theme demos ("John Doe", "Lorem Ipsum", etc.) that
// were leaking into dm_name across dozens of unrelated leads.
const PLACEHOLDER_NAME_SET = new Set<string>([
  "john doe", "jane doe", "jane smith", "michael doe", "joe bloggs",
  "john citizen", "jane citizen", "your name", "first last",
  "firstname lastname", "full name", "lorem ipsum", "test test", "sample name",
]);
const PLACEHOLDER_GENERIC_FIRSTS = new Set(["john", "jane", "michael", "joe"]);

function isPlaceholderName(name: string): boolean {
  const norm = name.toLowerCase().replace(/\s+/g, " ").trim();
  if (!norm) return true;
  if (PLACEHOLDER_NAME_SET.has(norm)) return true;
  if (norm.includes("lorem")) return true;
  const parts = norm.split(" ");
  // "<generic first> ... doe" (e.g. "john doe", "michael doe", "john q doe")
  if (parts.length >= 2 && parts[parts.length - 1] === "doe"
      && PLACEHOLDER_GENERIC_FIRSTS.has(parts[0])) return true;
  return false;
}

// Website heading fragments were leaking into dm_name ("Our Electricians Meet",
// "Meet The Managing", etc.). Strip a leading "Meet " and reject obvious
// heading / section titles that aren't personal names.
const MEET_STRIP_RE = /^meet\s+/i;
const HEADING_START_RE = /^(our|your|the|why|about|contact|welcome|meet)\b/i;
const HEADING_END_RE = /(team|story|history|services|staff|crew|us|electricians|plumbers|builders)$/i;
const HEADING_SINGLE_RE = /^(team|staff|crew|services|story)$/i;

function isHeadingFragment(name: string): boolean {
  const norm = name.toLowerCase().replace(/\s+/g, " ").trim();
  if (!norm) return true;
  if (HEADING_SINGLE_RE.test(norm)) return true;
  if (HEADING_START_RE.test(norm)) return true;
  if (HEADING_END_RE.test(norm)) return true;
  return false;
}

function cleanCandidateName(raw: string): string | null {
  if (!raw) return null;
  let name = raw.trim();
  // Drop trailing punctuation/comma clutter
  name = name.replace(/[,;:.\-–—]+$/g, "").trim();
  // Strip a leading "Meet " before role-word stripping so "Meet Nathan Bettridge"
  // becomes a valid name instead of a heading fragment.
  for (let i = 0; i < 3; i++) {
    const next = name.replace(MEET_STRIP_RE, "").trim();
    if (next === name) break;
    name = next;
  }
  // Strip leading/trailing role words repeatedly
  for (let i = 0; i < 3; i++) {
    const next = name.replace(ROLE_STRIP_RE, "").trim();
    if (next === name) break;
    name = next;
  }
  if (!name) return null;
  if (HOMEOWNER_RE.test(name)) return null;
  if (isPlaceholderName(name)) return null;
  if (isHeadingFragment(name)) return null;

  const tokens = name.split(/\s+/);
  if (tokens.length < 2 || tokens.length > 3) return null;

  // Loosened Title-case token rule. Accept:
  //   - Standard Title-case:            Ray, Glavinovic
  //   - Apostrophes:                    O'Brien, D'Angelo
  //   - Hyphenated:                     Jo-Anne, Smith-Jones
  //   - Mc/Mac prefixes:                McDonald, MacLeod
  // Still rejects: ALL-CAPS, single tokens, digits, punctuation-only tokens,
  // and stoplist words (checked case-insensitively across each sub-part).
  const TOKEN_RE =
    /^(?:(?:Mc|Mac)[A-Z][a-z]+|[A-Z][a-z]+(?:['\u2019][A-Z]?[a-z]+)?(?:-[A-Z][a-z]+(?:['\u2019][A-Z]?[a-z]+)?)*)$/;

  for (const tok of tokens) {
    if (!TOKEN_RE.test(tok)) return null;
    // Any sub-part (split on hyphen or apostrophe) hitting the stoplist rejects
    // the whole token — catches "Home-Owner", "Team-Smith", etc.
    const parts = tok.split(/[-'\u2019]/).filter(Boolean);
    for (const part of parts) {
      if (NAME_STOPLIST.has(part.toLowerCase())) return null;
    }
  }
  const finalName = tokens.join(" ");
  // Re-check after normalization in case token casing hid the placeholder.
  if (isPlaceholderName(finalName)) return null;
  return finalName;
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

// ==== AU address extraction (additive) ====
const AU_STATES = new Set(["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"]);
function titleCaseSuburb(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}
function postcodeToState(pc: string): string | null {
  const d = pc[0];
  const map: Record<string, string> = {
    "2": "NSW", "3": "VIC", "4": "QLD", "5": "SA",
    "6": "WA", "7": "TAS", "0": "NT", "8": "VIC", "9": "QLD",
  };
  return map[d] ?? null;
}
function extractAuAddress(text: string): { state: string | null; city: string | null } {
  try {
    if (!text) return { state: null, city: null };
    // Primary: SUBURB STATE POSTCODE
    const re = /\b([A-Za-z][A-Za-z .'\-]{1,40}?)\s+(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\.?\s+(\d{4})\b/i;
    const m = re.exec(text);
    if (m) {
      const suburbRaw = m[1].trim().replace(/[,.]+$/g, "").trim();
      const state = m[2].toUpperCase();
      // Reject obvious non-suburb tokens
      const lower = suburbRaw.toLowerCase();
      const bad = ["street", "road", "avenue", "highway", "suite", "unit", "level", "po box", "phone", "email", "abn", "acn"];
      if (AU_STATES.has(state) && suburbRaw.length >= 2 && !bad.some((b) => lower.endsWith(b) || lower === b)) {
        return { state, city: titleCaseSuburb(suburbRaw) };
      }
    }
    // Fallback: bare 4-digit postcode near an address keyword
    const kwRe = /\b(address|located|based|office|suite|unit|servicing|serving|shop|po\s*box|street|road|avenue)\b[^\n]{0,80}?\b(\d{4})\b/i;
    const km = kwRe.exec(text);
    if (km) {
      const state = postcodeToState(km[2]);
      if (state) return { state, city: null };
    }
  } catch {
    /* never break enrichment */
  }
  return { state: null, city: null };
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

  // 4b. Extended name-source patterns (deep crawl uses these too).
  //     Runs even after 4 to fill in a name if step 4 didn't match. Any hit
  //     here is treated as owner-attributed.
  if (!out.name) {
    const extraSources: { re: RegExp; roleAdjacent: boolean }[] = [
      { re: OWNER_LEAD_RE, roleAdjacent: true },
      { re: NAME_TRAIL_ROLE_RE, roleAdjacent: true },
      { re: MEET_NAME_RE, roleAdjacent: false },
      { re: HI_IM_RE, roleAdjacent: false },
    ];
    const candidates: { name: string; roleAdjacent: boolean }[] = [];
    for (const src of extraSources) {
      src.re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = src.re.exec(text)) !== null) {
        const idx = m.index;
        const window = text.slice(Math.max(0, idx - 60), idx + m[0].length + 60);
        if (HOMEOWNER_RE.test(window)) continue;
        const cleaned = cleanCandidateName(m[1]);
        if (!cleaned) continue;
        candidates.push({ name: cleaned, roleAdjacent: src.roleAdjacent });
      }
    }
    // Heading-adjacent team names (needs raw HTML — run against `html`).
    HEADING_NAME_RE.lastIndex = 0;
    let hm: RegExpExecArray | null;
    while ((hm = HEADING_NAME_RE.exec(html)) !== null) {
      const idx = hm.index;
      const around = html.slice(Math.max(0, idx - 300), idx + hm[0].length + 300);
      const cleaned = cleanCandidateName(hm[1]);
      if (!cleaned) continue;
      const roleAdjacent = OWNER_KEYWORD_RE.test(around) && !HOMEOWNER_RE.test(around);
      if (roleAdjacent) candidates.push({ name: cleaned, roleAdjacent: true });
    }
    // Prefer role-adjacent hits.
    const picked = candidates.find((c) => c.roleAdjacent) ?? candidates[0];
    if (picked) {
      out.name = picked.name;
      out.ownerAttributed = true;
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
  allowAiName: boolean,
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
  addrState: string | null;
  addrCity: string | null;
  aiCalled: boolean;
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
      addrState: null, addrCity: null,
      aiCalled: false,
    };
  }
  const host = new URL(base).host;

  let result: ExtractResult = { mobile: null, email: null, name: null, ownerAttributed: false, aboutTextForAi: null };
  let pagesFetched = 0;
  let sawJsonLd = false;
  let sawRegex = false;
  let homepageText: string | null = null;
  let combinedText = "";

  for (let i = 0; i < PATHS.length && pagesFetched < MAX_FETCHES; i++) {
    const url = base + PATHS[i];
    const html = await fetchPage(url);
    if (html === null) continue;
    pagesFetched++;
    if (PATHS[i] === "/" && !homepageText) {
      homepageText = stripHtml(html).slice(0, 4000);
    }
    try {
      combinedText += " " + stripHtml(html).slice(0, 8000);
    } catch { /* ignore */ }
    const before = { name: result.name, mobile: result.mobile };
    result = extractFromHtml(html, host, result, PATHS[i]);
    if (!before.name && result.name && result.ownerAttributed) sawJsonLd = true;
    if (!before.mobile && result.mobile && result.ownerAttributed) sawJsonLd = true;
    if (!before.name && result.name && !sawJsonLd) sawRegex = true;
    // Short-circuit if we have both a confident name and a mobile
    if (result.name && result.mobile) break;
  }

  // AU address extraction — best-effort, never throws.
  let addrState: string | null = null;
  let addrCity: string | null = null;
  try {
    const addr = extractAuAddress(combinedText);
    addrState = addr.state;
    addrCity = addr.city;
  } catch { /* ignore */ }

  // AI fallback for name only — value-gated so only reachable / high-value
  // leads spend AI credits. Free extraction above already ran for everyone.
  let usedAi = false;
  let aiCalled = false;
  if (allowAiName && !result.name && result.aboutTextForAi && lovableApiKey) {
    aiCalled = true;
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
    addrState,
    addrCity,
    aiCalled,
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

// Discover secondary pages likely to name the owner. Uses homepage nav links
// (href/text matches /about|team|our-story|meet|contact|staff|people/i) PLUS
// the common-path list. Same-host only. Deduped. Capped by caller.
function discoverSecondaryPages(homepageHtml: string, base: string): string[] {
  const found = new Set<string>();
  let host = "";
  try { host = new URL(base).host.toLowerCase(); } catch { return []; }

  const anchorRe = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  let scanned = 0;
  while ((m = anchorRe.exec(homepageHtml)) !== null && scanned < 400) {
    scanned++;
    const rawHref = m[1];
    const inner = stripHtml(m[2] || "");
    if (!rawHref) continue;
    let abs: string;
    try {
      abs = new URL(rawHref, base).toString();
    } catch { continue; }
    let u: URL;
    try { u = new URL(abs); } catch { continue; }
    if (u.host.toLowerCase() !== host) continue;
    if (!/^https?:$/.test(u.protocol)) continue;
    const path = u.pathname;
    if (path === "/" || path === "") continue;
    if (!DEEP_LINK_HREF_RE.test(path) && !DEEP_LINK_TEXT_RE.test(inner)) continue;
    // Strip query/hash — same page effectively.
    const norm = `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "") || "/"}`;
    if (norm === base || norm === base + "/") continue;
    found.add(norm);
  }
  // Then append common candidate paths (may 404, which is fine).
  for (const p of DEEP_CANDIDATE_PATHS) {
    const norm = `${base}${p}`;
    found.add(norm);
  }
  return Array.from(found);
}

// ── Page-level signals extracted from RAW HTML (before stripHtml). ──
// Detects ad-tech pixels, an ABN in the footer, and a founding year.
// Purely additive; every step is try/catch-guarded by the caller.
type PageSignals = {
  hasFacebookPixel: boolean;
  hasGoogleAds: boolean;
  abn: string | null;         // 11-digit, no spaces
  foundingYear: number | null; // 4-digit year, sanity-checked
};

function emptySignals(): PageSignals {
  return { hasFacebookPixel: false, hasGoogleAds: false, abn: null, foundingYear: null };
}

function mergePageSignals(into: PageSignals, from: PageSignals) {
  if (from.hasFacebookPixel) into.hasFacebookPixel = true;
  if (from.hasGoogleAds) into.hasGoogleAds = true;
  if (!into.abn && from.abn) into.abn = from.abn;
  // Prefer the earliest plausible founding year across pages.
  if (from.foundingYear && (!into.foundingYear || from.foundingYear < into.foundingYear)) {
    into.foundingYear = from.foundingYear;
  }
}

const FB_PIXEL_PATTERNS = [
  /\bfbq\s*\(/i,
  /connect\.facebook\.net\/[^"'\s]*\/fbevents\.js/i,
  /facebook\.com\/tr\?id=/i,
];
const GOOGLE_ADS_PATTERNS = [
  /googleadservices\.com\/pagead/i,
  /gtag\/js\?id=AW-/i,
  /["']AW-\d{5,}["']/,               // AW-1234567 conversion IDs in quotes
  /googleads\.g\.doubleclick\.net/i,
];
const ABN_RE = /ABN[:\s]*([\d\s]{11,20})/i;
// Common "since / established / est. / founded / serving ... since YEAR" patterns.
const YEAR_PATTERNS = [
  /\b(?:established|est\.?|founded|serving\s+[^.]*?since|proudly\s+serving\s+[^.]*?since|operating\s+since|trading\s+since|in\s+business\s+since|since)\s*(?:in\s+)?(\d{4})\b/i,
];

function extractPageSignals(html: string): PageSignals {
  const s = emptySignals();
  if (!html || typeof html !== "string") return s;
  // Ad-tech detection — scan raw HTML (scripts, iframes, noscript pixels included).
  try {
    for (const re of FB_PIXEL_PATTERNS) {
      if (re.test(html)) { s.hasFacebookPixel = true; break; }
    }
  } catch { /* ignore */ }
  try {
    for (const re of GOOGLE_ADS_PATTERNS) {
      if (re.test(html)) { s.hasGoogleAds = true; break; }
    }
  } catch { /* ignore */ }
  // ABN — strip spaces, must be exactly 11 digits.
  try {
    const m = html.match(ABN_RE);
    if (m && m[1]) {
      const digits = m[1].replace(/\s+/g, "");
      if (/^\d{11}$/.test(digits)) s.abn = digits;
    }
  } catch { /* ignore */ }
  // Founding year — sanity-check against 1900..currentYear.
  try {
    const currentYear = new Date().getFullYear();
    for (const re of YEAR_PATTERNS) {
      const m = html.match(re);
      if (m && m[1]) {
        const yr = Number(m[1]);
        if (Number.isInteger(yr) && yr >= 1900 && yr <= currentYear) {
          s.foundingYear = yr;
          break;
        }
      }
    }
  } catch { /* ignore */ }
  return s;
}

// Deep crawl: homepage + up to 4 secondary owner-likely pages. Runs the SAME
// extractor across every page. Only writes fields that are currently empty.
// Fully defensive — never throws, safe when no pages resolve.
async function processDeepCrawl(
  contact: {
    id: string;
    website: string | null;
    dm_name: string | null;
    dm_phone: string | null;
    dm_email: string | null;
  },
  lovableApiKey: string | undefined,
  allowAiName: boolean,
): Promise<{
  mobile: string | null;
  email: string | null;
  name: string | null;
  pagesFetched: number;
  ms: number;
  signals: PageSignals;
  aiCalled: boolean;
}> {
  const start = Date.now();
  const base = contact.website ? normalizeWebsite(contact.website) : null;
  if (!base) return { mobile: null, email: null, name: null, pagesFetched: 0, ms: Date.now() - start, signals: emptySignals(), aiCalled: false };

  let host = "";
  try { host = new URL(base).host; } catch { return { mobile: null, email: null, name: null, pagesFetched: 0, ms: Date.now() - start, signals: emptySignals(), aiCalled: false }; }

  let result: ExtractResult = { mobile: null, email: null, name: null, ownerAttributed: false, aboutTextForAi: null };
  let pagesFetched = 0;
  let aboutText: string | null = null;
  const signals: PageSignals = emptySignals();

  // 1. Homepage first (so we can discover its nav links).
  const homepageHtml = await fetchPage(base + "/");
  if (homepageHtml !== null) {
    pagesFetched++;
    result = extractFromHtml(homepageHtml, host, result, "/");
    try { mergePageSignals(signals, extractPageSignals(homepageHtml)); } catch { /* ignore */ }
  }

  // 2. Secondary pages — nav links + common paths, capped at DEEP_MAX_PAGES total.
  const secondary = homepageHtml ? discoverSecondaryPages(homepageHtml, base) : DEEP_CANDIDATE_PATHS.map((p) => base + p);
  for (const url of secondary) {
    if (pagesFetched >= DEEP_MAX_PAGES) break;
    // Note: don't early-exit on name/mobile/email alone — we still want to
    // scan footer/head for ABN, ad pixels, and years-in-business.
    let path = "/";
    try { path = new URL(url).pathname; } catch { /* keep default */ }
    let html: string | null = null;
    try { html = await fetchPage(url); } catch { html = null; }
    if (html === null) continue;
    pagesFetched++;
    try {
      result = extractFromHtml(html, host, result, path);
    } catch { /* never break the batch */ }
    try { mergePageSignals(signals, extractPageSignals(html)); } catch { /* ignore */ }
    if (!aboutText && result.aboutTextForAi) aboutText = result.aboutTextForAi;
  }

  // AI fallback for name only — value-gated so we only spend AI credits on
  // leads a rep is realistically going to call.
  let aiCalled = false;
  if (allowAiName && !result.name && aboutText && lovableApiKey) {
    try {
      const aiName = await aiExtractName(aboutText, lovableApiKey);
      aiCalled = true;
      if (aiName) result.name = aiName;
    } catch { /* ignore */ }
  }

  return {
    mobile: result.mobile,
    email: result.email,
    name: result.name,
    pagesFetched,
    ms: Date.now() - start,
    signals,
    aiCalled,
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

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine
  }
  const batchSize = Math.min(Math.max(Number(body?.batchSize) || 25, 1), 60);
  const forcedIds: string[] | null = Array.isArray(body?.contactIds) && body.contactIds.length > 0 ? body.contactIds : null;
  const mode: "default" | "deep_crawl" = body?.mode === "deep_crawl" ? "deep_crawl" : "default";

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // ── Duplicate-number / duplicate-email write-guards ──
  // Prevents crawled shared-template numbers/emails from being written to
  // dozens of unrelated contacts. Compares last-9-digits of phone across
  // contacts.dm_phone AND contacts.phone; case-insensitive match for emails.
  const APPEND_NOTE_PHONE =
    "Crawled mobile matched another lead's number — likely shared/template number, not written";
  const APPEND_NOTE_EMAIL =
    "Crawled email matched 3+ other leads — likely template/generic address, not written";

  async function isDuplicatePhone(candidate: string, excludeId: string): Promise<boolean> {
    try {
      const digits = (candidate ?? "").replace(/[^0-9]/g, "");
      if (digits.length < 9) return false;
      const { data, error } = await admin.rpc("count_contacts_with_phone_digits", {
        _digits: digits,
        _exclude_id: excludeId,
      });
      if (error) {
        console.error("[enrich-leads] dup-phone RPC failed:", error.message);
        return false;
      }
      return Number(data ?? 0) >= 1;
    } catch (err: any) {
      console.error("[enrich-leads] dup-phone check threw:", err?.message ?? err);
      return false;
    }
  }

  async function isDuplicateEmail(candidate: string, excludeId: string): Promise<boolean> {
    try {
      const email = (candidate ?? "").trim();
      if (!email) return false;
      const { data, error } = await admin.rpc("count_contacts_with_dm_email", {
        _email: email,
        _exclude_id: excludeId,
      });
      if (error) {
        console.error("[enrich-leads] dup-email RPC failed:", error.message);
        return false;
      }
      // Owner-with-two-businesses is fine (1-2 occurrences); block at 3+.
      return Number(data ?? 0) >= 3;
    } catch (err: any) {
      console.error("[enrich-leads] dup-email check threw:", err?.message ?? err);
      return false;
    }
  }

  function appendRouteNote(update: Record<string, any>, existing: string | null | undefined, note: string) {
    // Only-if-empty semantics: don't spam a route note that's already been set.
    if (existing && String(existing).trim() !== "") return;
    if (update.best_route_to_decision_maker) return;
    update.best_route_to_decision_maker = note;
  }

  // ── Daily AI-call budget (Australia/Melbourne) ──
  // Bounds Lovable AI credit spend. Free extraction (scrape, regex, ad-tech,
  // ABN, address, years, ABR, DDG) ALWAYS runs — only the AI name-fallback
  // is capped by this budget.
  const melbTodayIso = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });
  let budgetRow: { id: string; day: string; calls_used: number; daily_cap: number } | null = null;
  try {
    const { data } = await admin
      .from("enrichment_ai_budget")
      .select("id, day, calls_used, daily_cap")
      .eq("kind", "enrichment_name")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    budgetRow = data as any;
  } catch (e) {
    console.warn("[enrich-leads] budget read failed:", (e as any)?.message ?? e);
  }
  let dailyCap = budgetRow?.daily_cap ?? 500;
  let callsUsedToday = budgetRow?.day === melbTodayIso ? (budgetRow?.calls_used ?? 0) : 0;
  const remainingBudget = Math.max(0, dailyCap - callsUsedToday);
  // Shared, mutable per-batch counter. Read/updated by every parallel worker
  // BEFORE it calls the AI, so the batch never exceeds `remainingBudget`.
  const batchAiState = { made: 0, limit: remainingBudget };
  const tryReserveAi = (): boolean => {
    if (batchAiState.made >= batchAiState.limit) return false;
    batchAiState.made++;
    return true;
  };
  console.log(
    `[enrich-leads] AI budget — cap=${dailyCap} used_today=${callsUsedToday} remaining=${remainingBudget} (Melbourne day ${melbTodayIso})`,
  );

  const persistBudget = async (aiCallsThisBatch: number) => {
    if (!budgetRow?.id) return;
    try {
      // Reset counter if day rolled over during the batch.
      const newUsed = budgetRow.day === melbTodayIso
        ? callsUsedToday + aiCallsThisBatch
        : aiCallsThisBatch;
      await admin
        .from("enrichment_ai_budget")
        .update({ day: melbTodayIso, calls_used: newUsed, updated_at: new Date().toISOString() })
        .eq("id", budgetRow.id);
    } catch (e) {
      console.warn("[enrich-leads] budget persist failed:", (e as any)?.message ?? e);
    }
  };

  // ── Deep-crawl mode ──
  // Additive, isolated re-run: hits leads that already have a website but no
  // dm_name, fetches the homepage plus up to 4 owner-likely secondary pages,
  // and marks deep_crawl_attempted=true when done (even on no-find).
  if (mode === "deep_crawl") {
    let deepQuery = admin
      .from("contacts")
      .select("id, website, dm_name, dm_phone, dm_email, best_route_to_decision_maker, has_facebook_ads, has_google_ads, buying_signal_strength, abn, years_in_business, phone_type, prospect_tier");
    if (forcedIds) {
      deepQuery = deepQuery.in("id", forcedIds);
    } else {
      deepQuery = deepQuery
        .not("website", "is", null)
        .neq("website", "")
        .is("dm_name", null)
        .neq("deep_crawl_attempted", true)
        .order("created_at", { ascending: true })
        .limit(batchSize);
    }
    const { data: deepContacts, error: deepErr } = await deepQuery;
    if (deepErr) return json({ error: `Deep select failed: ${deepErr.message}` }, 500);

    // Empty backlog — idle for free, no AI, no counts query needed.
    if (!forcedIds && (!deepContacts || deepContacts.length === 0)) {
      console.log("[enrich-leads/deep] empty batch — no work, no AI calls.");
      return json({
        mode: "deep_crawl", processed: 0, names_found: 0, mobiles_found: 0,
        emails_found: 0, fb_pixels_found: 0, google_ads_found: 0,
        abns_found: 0, years_in_business_found: 0, signal_bumps: 0,
        remaining: 0, ai_name_calls: 0, logs: [],
      });
    }

    let deepRemaining = 0;
    if (!forcedIds) {
      const { count } = await admin
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .not("website", "is", null)
        .neq("website", "")
        .is("dm_name", null)
        .neq("deep_crawl_attempted", true);
      deepRemaining = Math.max((count ?? 0) - (deepContacts?.length ?? 0), 0);
    }

    let d_names = 0, d_mobiles = 0, d_emails = 0;
    let d_fb = 0, d_gads = 0, d_abn = 0, d_years = 0, d_signal_bump = 0;
    let d_ai_calls = 0;
    let d_ai_eligible = 0;
    const deepLogs: any[] = [];

    const perDeep = async (c: any) => {
      try {
        const worthAi =
          (c.dm_phone !== null && c.dm_phone !== "") ||
          c.phone_type === "mobile" ||
          c.prospect_tier === "Tier 1 - Hot" ||
          c.prospect_tier === "Tier 2 - Warm" ||
          c.has_google_ads === "yes" ||
          c.has_facebook_ads === "yes";
        if (worthAi) d_ai_eligible++;
        // Cap gate: reserve a slot in the shared batch counter BEFORE calling
        // AI. Free extraction still runs when allowAi=false.
        const allowAi = worthAi && tryReserveAi();
        const r = await processDeepCrawl({
          id: c.id,
          website: c.website,
          dm_name: c.dm_name,
          dm_phone: c.dm_phone,
          dm_email: c.dm_email,
        }, LOVABLE_API_KEY, allowAi);
        if (r.aiCalled) d_ai_calls++;
        // If we reserved but AI wasn't actually called (e.g. no aboutText, no key),
        // release the slot so another lead can use it.
        if (allowAi && !r.aiCalled && batchAiState.made > 0) batchAiState.made--;

        const update: Record<string, any> = {
          deep_crawl_attempted: true,
        };
        if (r.name && (!c.dm_name || c.dm_name === "")) {
          update.dm_name = r.name;
          d_names++;
        }
        if (r.mobile && (!c.dm_phone || c.dm_phone === "")) {
          if (await isDuplicatePhone(r.mobile, c.id)) {
            appendRouteNote(update, c.best_route_to_decision_maker, APPEND_NOTE_PHONE);
          } else {
            update.dm_phone = r.mobile;
            update.dm_phone_type = "mobile";
            d_mobiles++;
          }
        }
        if (r.email && (!c.dm_email || c.dm_email === "")) {
          if (await isDuplicateEmail(r.email, c.id)) {
            appendRouteNote(update, c.best_route_to_decision_maker, APPEND_NOTE_EMAIL);
          } else {
            update.dm_email = r.email;
            d_emails++;
          }
        }
        // ── Signals from raw HTML (ad-tech, ABN, years-in-business) ──
        try {
          const sig = r.signals;
          if (sig.hasFacebookPixel && c.has_facebook_ads !== "yes") {
            update.has_facebook_ads = "yes";
            d_fb++;
          }
          if (sig.hasGoogleAds && c.has_google_ads !== "yes") {
            update.has_google_ads = "yes";
            d_gads++;
          }
          // ABN — only-if-empty, exactly 11 digits (validated in extractor).
          if (sig.abn && (!c.abn || c.abn === "")) {
            update.abn = sig.abn;
            d_abn++;
          }
          // Years-in-business — only-if-empty.
          if (sig.foundingYear && (c.years_in_business === null || c.years_in_business === undefined)) {
            const yrs = new Date().getFullYear() - sig.foundingYear;
            if (yrs >= 0 && yrs <= 200) {
              update.years_in_business = yrs;
              d_years++;
            }
          }
          // Buying-signal bump: NULL → 'Moderate' when EITHER ad flag detected.
          // Never overwrite an existing value, and NEVER set 'None' (would exclude from queue).
          if ((sig.hasFacebookPixel || sig.hasGoogleAds) &&
              (c.buying_signal_strength === null || c.buying_signal_strength === undefined)) {
            update.buying_signal_strength = "Moderate";
            d_signal_bump++;
          }
        } catch { /* signals are best-effort */ }
        const { error: upErr } = await admin.from("contacts").update(update).eq("id", c.id);
        if (upErr) console.error(`[enrich-leads/deep] update ${c.id} failed:`, upErr.message);
        deepLogs.push({ contactId: c.id, pages: r.pagesFetched, ms: r.ms, name: r.name, mobile: r.mobile, email: r.email });
      } catch (err: any) {
        console.error(`[enrich-leads/deep] contact ${c.id} threw:`, err?.message ?? err);
        await admin.from("contacts").update({ deep_crawl_attempted: true }).eq("id", c.id);
        deepLogs.push({ contactId: c.id, error: String(err?.message ?? err) });
      }
    };

    await runInChunks(deepContacts ?? [], DEEP_CONCURRENCY, perDeep);

    console.log(`[enrich-leads/deep] AI name calls: ${d_ai_calls} of ${deepContacts?.length ?? 0} leads (${d_ai_eligible} eligible by value gate)`);
    await persistBudget(d_ai_calls);

    return json({
      mode: "deep_crawl",
      processed: deepContacts?.length ?? 0,
      names_found: d_names,
      mobiles_found: d_mobiles,
      emails_found: d_emails,
      fb_pixels_found: d_fb,
      google_ads_found: d_gads,
      abns_found: d_abn,
      years_in_business_found: d_years,
      signal_bumps: d_signal_bump,
      remaining: deepRemaining,
      ai_name_calls: d_ai_calls,
      ai_budget: { daily_cap: dailyCap, used_before: callsUsedToday, remaining_before: remainingBudget, used_this_batch: d_ai_calls },
      logs: deepLogs,
    });
  }

  // Select batch
  let query = admin
    .from("contacts")
    .select("id, website, email, business_name, industry, trade_type, phone, phone_type, prospect_tier, dm_phone, dm_email, dm_name, best_route_to_decision_maker, city, state, has_google_ads, has_facebook_ads");

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

  // Empty backlog — idle for free.
  if (!forcedIds && (!contacts || contacts.length === 0)) {
    console.log("[enrich-leads] empty batch — no work, no AI calls.");
    return json({
      processed: 0, mobiles_found: 0, emails_found: 0, names_found: 0,
      websites_found: 0, states_found: 0, cities_found: 0,
      remaining: 0, ai_name_calls: 0, logs: [],
    });
  }

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
  let states_found = 0;
  let cities_found = 0;
  let ai_name_calls = 0;
  let ai_name_eligible = 0;
  const logs: any[] = [];

  const perContact = async (c: any) => {
    try {
      const worthAi =
        (c.dm_phone !== null && c.dm_phone !== "") ||
        c.phone_type === "mobile" ||
        c.prospect_tier === "Tier 1 - Hot" ||
        c.prospect_tier === "Tier 2 - Warm" ||
        c.has_google_ads === "yes" ||
        c.has_facebook_ads === "yes";
      if (worthAi) ai_name_eligible++;
      const allowAi = worthAi && tryReserveAi();
      const r = await processContact({
        id: c.id,
        website: c.website,
        email: c.email,
        business_name: c.business_name,
        industry: c.industry,
        city: c.city,
        state: c.state,
      }, LOVABLE_API_KEY, allowAi);
      if (r.aiCalled) ai_name_calls++;
      if (allowAi && !r.aiCalled && batchAiState.made > 0) batchAiState.made--;

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
        if (await isDuplicatePhone(r.mobile, c.id)) {
          appendRouteNote(update, c.best_route_to_decision_maker, APPEND_NOTE_PHONE);
        } else {
          update.dm_phone = r.mobile;
          update.dm_phone_type = "mobile";
          mobiles_found++;
        }
      }
      if (r.email && (!c.dm_email || c.dm_email === "")) {
        if (await isDuplicateEmail(r.email, c.id)) {
          appendRouteNote(update, c.best_route_to_decision_maker, APPEND_NOTE_EMAIL);
        } else {
          update.dm_email = r.email;
          emails_found++;
        }
      }
      if (r.name && (!c.dm_name || c.dm_name === "")) {
        update.dm_name = r.name;
        names_found++;
      }
      if (r.addrState && (!c.state || String(c.state).trim() === "")) {
        update.state = r.addrState;
        states_found++;
      }
      if (r.addrCity && (!c.city || String(c.city).trim() === "")) {
        update.city = r.addrCity;
        cities_found++;
      }
      if (r.mobile && (!c.dm_phone || c.dm_phone === "") && update.dm_phone && !c.best_route_to_decision_maker && !update.best_route_to_decision_maker) {
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

  console.log(`[enrich-leads] AI name calls: ${ai_name_calls} of ${sorted.length} leads (${ai_name_eligible} eligible by value gate)`);
  await persistBudget(ai_name_calls);

  return json({
    processed: sorted.length,
    mobiles_found,
    emails_found,
    names_found,
    websites_found,
    states_found,
    cities_found,
    remaining,
    ai_name_calls,
    ai_budget: { daily_cap: dailyCap, used_before: callsUsedToday, remaining_before: remainingBudget, used_this_batch: ai_name_calls },
    logs,
  });
});