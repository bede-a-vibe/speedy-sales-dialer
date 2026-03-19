

## Problem

Talk time in reports is always showing 0 because Dialpad call duration data never makes it into `call_logs`. Here is why:

1. **`call_logs.dialpad_call_id` is never populated** — The dialer captures the Dialpad call ID during the session, but the "resolve call" step frequently fails (seen in edge function logs: repeated "No active call found"). When it fails, `activeDialpadCallId` is null at the time `logAndNext` fires, so the `dialpad_call_id` column stays empty.

2. **`dialpad_calls.call_log_id` is never linked** — The linking step (`linkDialpadCallLog`) depends on having a valid `dialpad_call_id`, which is null. All 33 tracked `dialpad_calls` records show `call_log_id = null`.

3. **Webhook sync can't find the right row** — When Dialpad sends a hangup webhook, the sync function tries to update `call_logs` by `call_log_id` (null) or by `dialpad_call_id` (also null in `call_logs`). So talk time is extracted from Dialpad but never written.

**Result**: 185 calls in the last 7 days, zero with talk time data.

## Plan

### Step 1: Ensure `dialpad_call_id` is set on `call_logs` via the webhook sync

The webhook sync already has access to both the `dialpad_calls` tracking record (which has `contact_id` + `user_id`) and the Dialpad call ID. When `call_log_id` is null on the tracked call, instead of only matching by `dialpad_call_id` on `call_logs` (which is also empty), fall back to matching by `contact_id` + `user_id` + recent `created_at` (within 15 minutes) to find the correct `call_logs` row.

**File**: `supabase/functions/dialpad/index.ts`
- In `syncWebhookPayload`, after finding the tracked call but before updating `call_logs`, add a fallback: if `call_log_id` is null and no `call_logs` row matches by `dialpad_call_id`, query for the most recent `call_logs` entry matching `contact_id` + `user_id` created within 15 minutes of the `dialpad_calls.created_at`.
- Once found, update both `call_logs` (set `dialpad_call_id`, talk time, summary, transcript) and `dialpad_calls` (set `call_log_id`).

### Step 2: Backfill existing `dialpad_calls` with matching `call_logs`

**File**: `supabase/functions/dialpad/index.ts`
- Add a new action `backfill_talk_time` (admin-only) that:
  1. Queries all `dialpad_calls` with `call_log_id IS NULL`.
  2. For each, finds matching `call_logs` by `contact_id` + `user_id` + close timestamp.
  3. Links them and fetches talk time from Dialpad API for the call, writing it to `call_logs`.

### Step 3: Improve `dialpad_call_id` capture in the dialer

**File**: `src/pages/DialerPage.tsx`
- When the `dialpad_calls` tracking record is created (which happens on call initiation), store the `dialpad_call_id` in a ref immediately so it's available even if resolution polling fails.
- Pass this ref's value to `logAndNext` so `call_logs` gets the `dialpad_call_id` written at insert time.

## Technical Details

- The webhook sync fallback query: `SELECT id FROM call_logs WHERE contact_id = $1 AND user_id = $2 AND created_at >= $3 ORDER BY created_at DESC LIMIT 1`
- Talk time extraction already works correctly via `extractDialpadDurations` — no changes needed there
- The `getTalkTimeSeconds()` function in `reportMetrics.ts` already prefers `dialpad_talk_time_seconds` — no changes needed
- Reports, hourly breakdown, and dashboard targets will automatically show correct talk time once the data flows through

