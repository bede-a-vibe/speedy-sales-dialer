# Server-side Lead Enrichment Pipeline

Build one new edge function `enrich-leads` plus a pg_cron schedule that drains the backlog and picks up newly-imported leads automatically. No other app code changes.

## 1. Edge function: `supabase/functions/enrich-leads/index.ts`

`verify_jwt = false` in `supabase/config.toml` so pg_cron and a manual trigger can call it without a user JWT. Protected instead by a shared `ENRICH_LEADS_SECRET` header (generated via `generate_secret`) — pg_cron sends it, manual trigger sends it, everything else is rejected 401.

### Request/response
- POST body: `{ batchSize?: number (default 25, max 50), contactIds?: string[] }`. `contactIds` lets an admin force-enrich specific leads.
- Response: `{ processed, mobiles_found, emails_found, names_found, remaining }`.

### Selection query (service-role client)
```
select id, website, phone, phone_type, prospect_tier
from contacts
where dm_enrich_attempted = false
  and website is not null and website <> ''
  and (dm_phone is null or dm_phone = '' or dm_email is null or dm_name is null)
order by
  (phone_type <> 'mobile') desc,          -- landlines first
  case prospect_tier
    when 'Tier 1 - Hot' then 1
    when 'Tier 2 - Warm' then 2
    else 9 end asc,
  created_at asc
limit :batchSize
```
Also compute `remaining` with a `count(*)` on the same predicate (without limit) so the caller knows when to stop looping.

### Per-contact pipeline
1. Normalize website (add `https://` if missing, strip trailing slash).
2. Candidate URLs, in order: `/`, `/contact`, `/contact-us`, `/about`, `/about-us`. Cap at 4 fetches. Stop early once we have both a mobile and a confident name.
3. `fetch()` each with:
   - `User-Agent: Mozilla/5.0 ... Chrome/... Safari/537.36`
   - `AbortController` with 6s timeout per request
   - `redirect: 'follow'`
   - Skip non-200 / non-HTML / >2MB responses.
4. Extract from each page:
   - **JSON-LD blocks** first: parse every `<script type="application/ld+json">`, walk for `Person`/`Organization` with `founder`/`owner`/`author`/`employee` → capture `name` + `telephone`. Highest-confidence path; if it yields both a mobile and a name, mark `owner_attributed=true` and short-circuit.
   - **Mobile regex** (AU only): `/(?:\+?61\s?|0)4\d{2}[\s-]?\d{3}[\s-]?\d{3}/g`. Normalize to `+61 4XX XXX XXX`. Reject anything matching `^1300|^1800|^13\d{2}$` or a landline pattern.
   - **Email regex**: standard, then filter out `noreply@`, `no-reply@`, `example@`, anything ending in `.png/.jpg/.svg`, and image-CDN hostnames. Prefer addresses on the site's own domain.
   - **Owner name regex**: `/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}),?\s+(Owner|Director|Founder|Managing Director|Principal|CEO)\b/`. Explicit denylist — reject if the surrounding 40-char window contains `homeowner`, `home owner`, `home-owner`, `homeowners`. This was the false-positive we hit before.
5. **AI fallback for name** (only if steps above gave no confident name AND we successfully fetched an About or Contact page): call Lovable AI gateway.
   - Endpoint: `POST https://ai.gateway.lovable.dev/v1/chat/completions`
   - Headers: `Authorization: Bearer ${LOVABLE_API_KEY}`
   - Body: `{ model: "google/gemini-2.5-flash", messages: [{role:"system", content:"You extract the single business owner/director's full name from About/Contact page text. Return JSON only: {\"name\": string|null}. Return null if not clearly stated. Never return the word 'homeowner' or a generic role."}, {role:"user", content: <trimmed 6k-char page text>}], response_format: {type:"json_object"}, temperature: 0.1 }`
   - On 429/402 → skip AI for this contact (still mark attempted), log warning.
6. **Write-back** (single `update` per contact):
   - `dm_phone` = mobile ONLY if current `dm_phone` is null/empty. Never touch `phone` or `phone_e164`.
   - `dm_phone_type = 'mobile'` when we set `dm_phone`.
   - `dm_email` when found (same "only if empty" rule).
   - `dm_name` only when confident (JSON-LD person, regex hit that passed the homeowner filter, or AI returned a non-null name).
   - `best_route_to_decision_maker` = `'Website mobile (owner-attributed)'` if `owner_attributed`, else `'Website mobile (may be general line — ask for owner)'` when we set a `dm_phone`. Leave existing value alone otherwise.
   - Always: `dm_enrich_attempted = true`, `dm_enriched_at = now()`, `dm_enrich_source = 'website'`. Set even on failure/no-hit so nothing loops.

### Concurrency & timing (addressing (a) and (b))
- **(a) Outbound fetch:** Supabase edge functions (Deno) can `fetch()` any public HTTP(S) URL — no allowlist. Practical caveats: no fixed per-request egress cap, but total wall-clock is bounded (~150s hard limit, tighter for early return), and misbehaving hosts can hang → we enforce our own 6s AbortController on every fetch.
- **(b) Execution budget:** Budget ~60s per invocation to stay well under the platform limit. With up to 4 fetches × 6s = 24s worst-case per contact serially, that would only be ~2 contacts/run. So process the batch with `Promise.all` in chunks of **5 concurrent contacts**; realistic per-contact time ≈ 3–8s. Default `batchSize=25` fits comfortably in ~30–45s. Hard cap `batchSize` at 50.

### Errors & logging
- Wrap each contact in try/catch — one failure never blocks the batch.
- Per-contact log line: `contactId, ms, mobile?, email?, name?, source (jsonld|regex|ai|none)`.
- Aggregate counters into the JSON response.

## 2. Scheduling (addressing (c))

Enable `pg_cron` and `pg_net` (if not already on). Add via the `supabase--insert` tool (contains project-specific URL + key, per project rules):

```sql
select cron.schedule(
  'enrich-leads-drain',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://xhcvwhcpaeetmmzkuwyw.supabase.co/functions/v1/enrich-leads',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-enrich-secret', '<ENRICH_LEADS_SECRET>'
    ),
    body := jsonb_build_object('batchSize', 25)
  );
  $$
);
```

Runs every minute. The function no-ops (`processed=0`) once `dm_enrich_attempted=false` is exhausted, so leaving it on is safe and newly-imported leads are picked up on the next tick automatically.

**Manual "Run enrichment now" trigger:** since the request said "keep it to this one function + scheduling — do not change any other part of the app", I will NOT add a UI button. Instead I'll document a one-line `curl` (or `supabase.functions.invoke('enrich-leads', { body:{ batchSize: 50 } })` snippet) you can paste from the browser console when logged in as admin. Say the word if you want an actual admin button and I'll add it in a follow-up.

## 3. Lovable AI call (addressing (d))

- Secret: `LOVABLE_API_KEY` is already provisioned in the project — no user action needed.
- Model: `google/gemini-2.5-flash` (matches the allowlist; cheap and fast for a 6k-char extraction).
- Called via the OpenAI-compatible `https://ai.gateway.lovable.dev/v1/chat/completions` endpoint with `response_format: json_object` and `temperature: 0.1`.
- Only invoked as a name fallback (not for phone/email) to keep cost bounded — worst case one AI call per contact, and only when JSON-LD + regex both missed.

## 4. Secrets to add before running
- `ENRICH_LEADS_SECRET` — generate via `generate_secret` (used by cron header + manual trigger).
- `LOVABLE_API_KEY` — should already exist; will verify with `fetch_secrets`.

## 5. Files touched
- Add: `supabase/functions/enrich-leads/index.ts`
- Edit: `supabase/config.toml` — add `[functions.enrich-leads]` block with `verify_jwt = false`.
- Data change (via `supabase--insert`): enable `pg_cron`/`pg_net` if needed + `cron.schedule` call above.

No changes to `contacts` schema (columns already exist), no changes to the dialer, RPCs, or UI.

## Out of scope / not doing
- No new UI, no changes to imports, no touching `phone`/`phone_e164`, no other RPC edits.
- No retry queue for failed sites in v1 — a failed fetch still marks `attempted=true`. If you later want a retry pass, we add a `dm_enrich_failed_at` column and a second cron that re-opens rows older than N days; flag it and I'll plan that separately.
