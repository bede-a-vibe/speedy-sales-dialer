
Implementation plan

Goal
- Add true rolling queue prefetching so the dialer always keeps the next leads ready.
- Prioritize leads by the fewest prior call attempts.
- Prevent two reps working the same industry from receiving the same leads by using hard locks with a 15-minute expiry.

What I’ll build

1. Backend lead-locking layer
- Add a new `dialer_lead_locks` table to reserve leads per rep/session.
- Each lock will store at least: `contact_id`, `user_id`, `session_id`, `expires_at`, timestamps.
- Enforce one active lock per lead so two reps cannot reserve the same contact at once.
- Add indexes for fast filtering and cleanup.

2. Atomic queue claim function
- Create a database function to:
  - clear expired locks,
  - find eligible contacts for the chosen industry/state,
  - exclude DNC/called leads,
  - exclude leads locked by other reps,
  - sort by `call_logs` count ascending, then stable fallback order,
  - lock the next chunk atomically,
  - return the reserved contacts plus an accurate queue count for that rep.
- This is the key fix for “same leads being called by multiple reps”.

3. Rolling prefetch on the dialer
- Replace the current “single limited query” approach with a dialer session queue hook.
- Keep a local reserved buffer and automatically prefetch the next chunk when the remaining buffer drops below a threshold.
- Example behavior:
```text
Target buffer: 40
Prefetch threshold: 15
Claim size: 25
```
- The rep gets fast next-lead transitions without loading huge datasets.

4. Session heartbeat and release
- While a rep is actively dialing, refresh lock expiry in the background so active leads stay reserved.
- On log, skip, stop session, or filter change, release consumed/current locks immediately.
- If the rep closes the page or crashes, locks naturally expire after 15 minutes.

5. Dialer UX safeguards
- Disable or explicitly reset industry/state filters during an active session so the app does not strand locked leads in the wrong queue.
- Keep queue counts accurate by showing:
  - leads available to this rep,
  - including their own reserved leads,
  - excluding leads locked by other reps.

Files likely to change
- `src/pages/DialerPage.tsx`
- `src/hooks/useContacts.ts` or a new dedicated dialer queue hook
- `src/hooks/useDialpad.ts` only if session release helpers are shared there
- new SQL migration for lock table/functions/indexes
- generated backend types will update automatically

Backend design
- New table: `dialer_lead_locks`
- New RPC/functions:
  - claim next leads
  - refresh session locks
  - release locks
- Add supporting indexes on:
  - `contacts(status, is_dnc, industry, state)`
  - `call_logs(contact_id)`
  - lock table unique/contact lookup fields

Lead priority logic
```text
1. Uncalled + not DNC + matching filters
2. Not locked by another rep
3. Lowest number of call_logs first
4. Oldest/earliest stable fallback order
```

Why this approach
- The current client query can limit volume, but it cannot safely coordinate multiple reps.
- Hard locking must happen atomically in the backend, otherwise two users can fetch the same lead before the UI updates.
- Rolling prefetch keeps the dialer fast without reintroducing the old timeout problem.

Validation after implementation
- Test two reps on the same industry and confirm their queues do not overlap.
- Test Electricians/HVAC with large datasets and confirm queue fills quickly.
- Confirm next leads are already available before the buffer runs out.
- Confirm skipped/logged leads release correctly.
- Confirm abandoned sessions recycle leads after 15 minutes.
- Check network activity to confirm there are no large repeated contact fetches or 504 timeouts.

Technical notes
- I’ll keep the existing contacts page behavior separate from the dialer-specific queue system.
- I’ll use backend-side locking rather than client-side filtering, because client-only protection is not reliable for concurrency.
- I’ll preserve current outcome logging and Dialpad flow, but wire queue advancement into the new reservation lifecycle.
