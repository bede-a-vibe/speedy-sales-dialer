
Goal: track total talk time from Dialpad and surface it in Reports only.

What I found
- The app already stores Dialpad-linked call data via `call_logs.dialpad_call_id` and `dialpad_calls`.
- The Dialpad backend function currently syncs summaries/transcripts, but it does not persist any call duration/talk-time field.
- Reports currently compute dialer KPIs from `call_logs` only, using `useCallLogsByDateRange()` and `getReportMetrics()`.
- Because reports already key off `call_logs`, the cleanest implementation is to store talk time on each call log row once Dialpad has final call data.

Recommended approach
1. Extend the backend schema to store Dialpad talk time on `call_logs`
- Add nullable fields like:
  - `dialpad_talk_time_seconds integer`
  - optionally `dialpad_total_duration_seconds integer` if you want future flexibility
- This keeps reporting simple and avoids joining against webhook payload history.

2. Capture talk time inside the Dialpad backend sync flow
- Update `supabase/functions/dialpad/index.ts` so that when a call reaches a terminal/syncable state, it also fetches final call details from Dialpad if needed.
- Extract talk time from the Dialpad response/webhook payload and normalize it to seconds.
- Update the linked `call_logs` row with that talk time alongside transcript/summary sync.
- Optionally mirror it onto `dialpad_calls` too for debugging, but the report source of truth should stay `call_logs`.

3. Preserve existing link behavior
- Keep using `dialpad_call_id` / `call_log_id` matching exactly as now.
- Ensure manually logged call rows that never receive Dialpad sync remain valid with `null` talk time.

4. Expand reporting metrics
- Update `src/lib/reportMetrics.ts` so report calculations include:
  - `totalTalkTimeSeconds`
  - `averageTalkTimeSeconds`
  - optionally answered-call average only
  - per-rep talk time totals for comparison rows
- Reuse the current filtered call-log flow so date range + rep filters work automatically.

5. Add report UI cards/table columns
- Update `src/pages/ReportsPage.tsx` to show talk-time KPIs in the dialer snapshot, such as:
  - Total Talk Time
  - Avg Talk Time / Dial
  - Avg Talk Time / Pick Up
- In Rep Comparison, add side-by-side talk-time columns, likely:
  - Total Talk Time
  - Avg Talk Time
- Keep formatting human-readable (`HH:MM:SS` or `MM:SS`).

Design choices
- Source of truth: `call_logs`, because reports already use it.
- Unit: seconds, because it is easy to aggregate and format.
- Sync timing: only once Dialpad has enough final data to avoid partial/inaccurate durations.
- Null-safe reporting: rows without Dialpad talk time should not break metrics.

Technical details
- Files to update:
  - `supabase/migrations/...` for new talk-time columns
  - `supabase/functions/dialpad/index.ts`
  - `src/hooks/useCallLogs.ts` only if typed payload selection needs expansion
  - `src/lib/reportMetrics.ts`
  - `src/pages/ReportsPage.tsx`
- Likely helper additions:
  - `extractTalkTimeSeconds(...)` in the Dialpad backend
  - `formatDurationShort(seconds)` in reports UI or metrics helpers
- Report logic should distinguish:
  - total talk time across filtered calls
  - average on all dials vs average on connected/answered calls
- No auth/RLS policy changes should be required if this is just adding nullable columns to existing secured tables.

Implementation sequence
1. Inspect Dialpad call-detail payload shape and confirm the exact talk-time field name from the API response/webhook.
2. Add nullable talk-time columns to `call_logs` (and optionally `dialpad_calls`).
3. Update backend sync to persist normalized talk time.
4. Update report metric aggregation to sum/average talk time.
5. Add report cards and rep comparison columns.
6. Validate with existing synced and non-synced calls so reports still render when talk time is missing.

Risks / watchouts
- Dialpad may expose multiple duration values; we should choose the real “talk time” field, not ringing or total elapsed time.
- Some historical call logs will have no talk time until future syncs occur, so UI must handle partial data gracefully.
- If talk time is only available from a separate Dialpad endpoint, the backend sync should fetch it once per completed call, not on every poll.

Suggested output in Reports
- Dialer KPI Snapshot:
  - Total Talk Time
  - Avg Talk Time / Dial
  - Avg Talk Time / Pick Up
- Rep Comparison:
  - Add `Talk Time` and `Avg Talk` columns, sorted consistently with existing metrics.
