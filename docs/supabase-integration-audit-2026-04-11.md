# Supabase integration audit note

Date: 2026-04-11
Scope reviewed: `supabase/functions/*`, `src/pages/FollowUpsPage.tsx`, `src/lib/ghl.ts`, `src/hooks/useGHLSync.ts`, `src/hooks/useGHLContactLink.ts`, `src/lib/emailDraftGenerator.ts`, `src/pages/UploadPage.tsx`

## Safe delta applied

### Fixed `ghl-followups` invocation mismatch
`src/pages/FollowUpsPage.tsx` was calling:
- function name: `ghl-followups`
- method: `GET`
- payload: request body `{ scope, date }`

But `supabase/functions/ghl-followups/index.ts` reads `scope` and `date` from `req.url` query params, not from the JSON body.

That meant the page could silently fall back to default scope/date behaviour, and on some fetch stacks a GET body is ignored entirely.

Updated the page to invoke:
- `ghl-followups?scope=...&date=...`
- with `method: "GET"`

This is frontend-safe and matches the deployed edge function contract.

## Present state found

### `supabase/functions/ghl-webhook`
Present and aligned with the current GHL-first direction.
- Supports create, update, delete/deactivate, and DND updates
- Matches by `ghl_contact_id`, phone, then email
- Writes operational-cache contact fields into Supabase
- Optional secret validation via `GHL_WEBHOOK_SECRET`

### `supabase/functions/ghl-followups`
Present and usable.
- Pulls open tasks from GHL
- Filters to current rep via email -> GHL user lookup
- Maps GHL contacts back to Supabase contacts
- Returns a UI-friendly follow-up list

### `supabase/functions/import-builders`
Present but intentionally deprecated.
- Returns HTTP 410
- Correctly points operators to GHL-first import via webhook sync

### `supabase/functions/requeue-follow-ups`
Present but intentionally deprecated.
- Returns HTTP 410
- Correctly indicates follow-up scheduling should come from GHL tasks

### `supabase/functions/generate-email-draft`
Present and wired from `src/lib/emailDraftGenerator.ts`.
- Auth protected
- Uses OpenAI-compatible chat completion endpoint
- Has frontend template fallback if the edge function is unavailable

### `supabase/functions/dialpad`
Present and significantly expanded.
Key integration work already in the real repo includes:
- authenticated Dialpad call initiation / resolve / hangup paths
- DND toggle handling around outbound calls
- webhook ingestion and sync of call metadata
- pending GHL push queue processing actions
- admin-only support actions like user sync and talk-time backfill

## Worth knowing, but not changed here

1. `src/lib/ghl.ts` and `src/lib/emailDraftGenerator.ts` call edge functions using direct project URLs instead of `supabase.functions.invoke()`.
   - This is workable, but slightly more brittle than the built-in helper.
   - I did not change it because it is currently consistent and low-risk.

2. `ghl-followups` returns no items when the logged-in app user cannot be matched to a GHL user by email.
   - This appears intentional, but it can look like an empty state rather than a configuration issue.

3. `import-builders` still ships an `.xlsx` file in the function directory even though the function is deprecated.
   - Harmless for MVP, but cleanup-only.

## Build / verification

A frontend change was made, so run a production build to confirm the patch remains safe.
