## Plan: Background-running GHL sync (continues without the page open)

Right now the sync loop lives in your browser tab — close the tab or navigate away and it stops mid-run. We'll move the loop to the server so once you press **Sync All Unlinked**, it runs to completion in the background. You can close the page, come back tomorrow, and the linked count will have climbed without you needing to babysit it.

### What you'll see

The GHL Sync page gets a small but important upgrade:

```
┌─ Run a sync ─────────────────────────────────────┐
│ A background job will keep running even if you  │
│ close this page.                                 │
│                                                  │
│ [ Sync Active Only (109) ]                       │
│ [ Sync All Unlinked (26,738) ]                   │
│ [ Stop background job ]   ← only when running    │
│                                                  │
│ ─── Background job: ghl_sync_2026-04-24_1842 ───│
│ Status: ⚙ Running  ·  Started 3 min ago          │
│ Mode: All unlinked                               │
│ Progress: ▓▓░░░░░░░░░░  1,840 / 26,738          │
│ ✓ Linked 1,802 · + Created 14 · ⤵ Skipped 24   │
│ ⚠ Failed: 0   · Last batch: 4.8s · ETA ~62 min  │
│ Auto-refreshing every 5s                         │
└──────────────────────────────────────────────────┘
```

Behavior changes:
- Pressing **Sync All Unlinked** kicks off a server-side job and immediately returns. The page just polls its progress every 5s.
- Closing the page, refreshing, or navigating to another route does **not** stop the job.
- Re-opening `/admin/ghl-sync` automatically picks up and shows the in-progress job.
- A new **Stop background job** button gracefully halts the loop after the current batch.
- If a previous run finished while the page was closed, you'll see a "Last completed run" summary at the top with the totals.

### How it works under the hood

Three pieces:

**1. New `ghl_sync_jobs` table** — single source of truth for job state
```
id (uuid)              status (queued|running|paused|done|failed|cancelled)
mode (active|all)      batch_size, delay_ms
offset, total          processed, linked, failed, skipped
created_by (user)      started_at, finished_at
last_batch_ms          last_error
```
Only one row per user can be `running` at a time. RLS limits visibility to admins.

**2. Edge function loop** — `ghl-sync-runner` (new)
- Triggered by the page when the user clicks Sync. Runs detached (`EdgeRuntime.waitUntil`) so the HTTP response returns instantly and the loop keeps executing on Supabase's side.
- Each iteration: claim next batch from `contacts`, call the existing GHL `upsert_contact` per row, update the `ghl_sync_jobs` row with new offsets/counters, sleep `delay_ms`, check if `status` was changed to `cancelled` by the user, repeat until `hasMore=false`.
- On any uncaught failure, marks job `failed` with the error message so the UI can show it.
- Edge functions on Supabase have a generous wall-clock budget for background tasks (using `EdgeRuntime.waitUntil`) — we'll size batches (50) and delays (6s) so a 26k run finishes inside a single invocation. If the runtime ever evicts the worker mid-loop, the next page load detects a `running` job whose `updated_at` is stale (>2 min) and restarts it from `offset`, so resumption is automatic.

**3. Reworked `GhlSyncPage.tsx`**
- On mount: query `ghl_sync_jobs` for the latest job for this admin (`order by created_at desc limit 1`).
- If status is `running`/`queued`: render the progress card and start polling every 5s via React Query (`refetchInterval: 5000`).
- If status is `done`/`failed`/`cancelled`: render a "Last completed run" summary with a "Start new sync" CTA.
- Buttons call the new `ghl-sync-runner` action with `{ start: true, mode, batchSize, delayMs }` or `{ cancel: true, jobId }`.
- Removes the old in-browser `while` loop and `stopRef` — the client no longer drives the loop, just observes it.

### Technical changes

- **Migration**: create `ghl_sync_jobs` table + indexes + RLS (admins read/write own rows) + a `ghl_sync_jobs_active_per_user_unique` partial unique index where `status in ('queued','running')` to prevent double-starts.
- **New edge function** `supabase/functions/ghl-sync-runner/index.ts`:
  - `action: "start"` → insert job row, return `jobId`, kick the loop with `EdgeRuntime.waitUntil(runLoop(jobId))`.
  - `action: "cancel"` → set `status='cancelled'` on the job; the running loop checks this between batches and exits cleanly.
  - `action: "status"` → return latest job row (also fine to read directly from the table via PostgREST; we'll use direct read for simplicity).
  - The loop reuses the existing `upsertContact` helper from `supabase/functions/ghl/index.ts` by importing the shared logic into a small `_shared.ts` file (allowed inside the `supabase/functions` tree).
- **Edited** `src/lib/ghl.ts`: add `startBackgroundGhlSync({ mode, batchSize, delayMs })`, `cancelBackgroundGhlSync(jobId)`, `getLatestGhlSyncJob()`.
- **Rewritten** `src/pages/GhlSyncPage.tsx`: drops the `useRef`/`while` loop, uses two React Query hooks (counts + latest job with 5s `refetchInterval`), and shows the new progress UI plus a "Last run" summary card.
- **Self-healing** stale-job detector: when the page loads and sees a `running` job whose `updated_at` is older than 2 minutes, it shows a "Job stalled — resume" button that calls `start` with the same `jobId` to continue from `offset`.

### Out of scope

- Multiple concurrent syncs by the same admin (intentionally blocked by the unique index — keeps GHL API rate limits sane).
- Email/Slack notification when the job finishes (easy follow-up if you want it; the data is already there in `ghl_sync_jobs.finished_at`).
- A jobs history page showing past runs — we'll keep the rows in the table, but the UI only surfaces the most recent one for now.
- Pulling new GHL-only contacts back into Supabase (still out of scope from the original plan).
