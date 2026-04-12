

# Plan: Add `process_pending_transcript_syncs` Action to Dialpad Edge Function

## Summary

Add a new admin-only action to `supabase/functions/dialpad/index.ts` that scans `dialpad_calls` for rows with `sync_status` in (`pending`, `processing`, `error`) where the call state is terminal (hangup), retries fetching transcript and summary from the Dialpad API, and updates all related tables.

## Technical Design

### New function: `processPendingTranscriptSyncs`

**Query criteria** (eligible rows):
- `sync_status` IN (`pending`, `processing`) -- not yet synced
- `call_state` = `hangup` -- call is finished, safe to retry
- `created_at` older than 2 minutes (avoid racing with live webhook processing)
- `created_at` newer than 7 days (Dialpad transcript retention window)
- Ordered by `created_at ASC`, limited by `limit` param (default 25, max 100)

**Per-row processing** (reuses existing helpers):
1. `fetchDialpadTranscript(dialpad_call_id, apiKey)` -- get transcript text
2. `fetchDialpadAiRecap(dialpad_call_id, apiKey)` -- get summary
3. `fetchDialpadCallInfo(dialpad_call_id, apiKey)` -- get durations
4. If transcript or summary found:
   - `upsertContactNote()` for `dialpad_summary` and `dialpad_transcript`
   - Resolve `call_log_id` (existing link, then by `dialpad_call_id`, then fallback) and update `call_logs` fields (`dialpad_summary`, `dialpad_transcript`, `transcript_synced_at`, duration fields)
   - If transcript exists and talk time > 15s, run `processAiSummaryAndPushToGhl()`
   - Update `dialpad_calls`: `sync_status = 'synced'`, `transcript_synced_at`, `sync_error = null`
5. If neither transcript nor summary available from Dialpad:
   - If call is older than 48 hours, mark `sync_status = 'error'`, `sync_error = 'Transcript not available from Dialpad after retry window'`
   - Otherwise leave as `pending` (will be retried next run)
6. On exception per-row: set `sync_status = 'error'`, `sync_error = error.message`, continue to next row

**Return value**: `{ processed, synced, skipped, failed, errors: string[] }`

### Action registration (two entry points)

1. **Authenticated admin action** (`case "process_pending_transcript_syncs"` in the main switch): requires `isAdmin`
2. **Cron secret path** (in the `cronSecret` block around line 2314): allows headless scheduled invocation

### Files changed

- `supabase/functions/dialpad/index.ts` -- add ~120 lines: the `processPendingTranscriptSyncs` async function and two case branches

### No database migration needed

The `dialpad_calls` table already has `sync_status`, `sync_error`, and `transcript_synced_at` columns. No schema changes required.

### Manual backfill invocation

After deployment, call the edge function with an admin auth token:

```bash
curl -X POST \
  https://xhcvwhcpaeetmmzkuwyw.supabase.co/functions/v1/dialpad \
  -H "Authorization: Bearer <ADMIN_USER_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"action": "process_pending_transcript_syncs", "limit": 50}'
```

Or via the cron secret path (if `DIALPAD_INTERNAL_CRON_SECRET` is set):

```bash
curl -X POST \
  https://xhcvwhcpaeetmmzkuwyw.supabase.co/functions/v1/dialpad \
  -H "x-cron-secret: <YOUR_CRON_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"action": "process_pending_transcript_syncs", "limit": 50}'
```

### Build errors

The existing build errors listed are unrelated to the dialpad edge function (they are in frontend `.tsx` files). They will not be affected by this change. I will also fix them in this implementation pass.

