
Problem
- The dialer is now functionally correct, but it still feels slow because the UI is waiting on too many network round trips in the hot path.
- The biggest delay is not a backend timeout anymore. The database-side lead claim query is completing in about 157ms for a large industry, so the remaining slowness is mostly from repeated/sequential requests and client blocking.

What I found
- Filter switching still calls `claim_dialer_leads(...claimSize: 0)` just to show queue counts. That still runs the full “visible contacts” logic and count path on every filter change.
- Starting a session waits for the full target buffer (`40`) before the UI can proceed. With claim size `25`, that means 2 sequential RPCs before dialing starts.
- Every lead change fetches full contact notes immediately and keeps polling them every 15s, even though notes/transcripts are secondary to placing the next call.
- Call actions are also slowed by extra client waits around status checks and mutation sequencing.

Plan
1. Make session start return fast
- Change the rolling queue to start dialing after the first small chunk is claimed.
- Keep the large buffer target, but fill the rest in the background after the first lead is shown.
- This removes the “wait for 40 leads before anything happens” delay.

2. Split preview counts from lead claiming
- Add a lightweight backend count path for queue preview/filter changes.
- Stop using the full claim RPC for non-dialing preview state.
- Debounce filter-triggered preview requests so fast industry/state changes don’t spam the backend.

3. Remove non-critical fetches from the hot path
- Stop loading all notes/transcript data immediately when the current lead changes.
- Lazy-load notes after the lead card is already visible, or only when that panel is opened/needed.
- Keep daily target lightweight as-is, but avoid any extra invalidation churn tied to dialer navigation.

4. Make “next lead” feel instant
- Advance the UI optimistically as soon as a lead is skipped/logged.
- Let lock release and background prefetch happen behind the scenes.
- Avoid waiting on queue refill before showing the next already-buffered lead.

5. Reduce call-action blocking
- Review the dial action flow so initiating/hanging up a call does not wait on unnecessary status prechecks.
- Keep status polling, but make button interactions optimistic where safe.
- Preserve rate-limit safeguards already in place.

6. Optimize backend lead ordering for scale
- Replace per-claim aggregation/sorting by `call_logs` with a cheaper sortable field on contacts, such as a maintained `call_attempt_count`.
- Update that field whenever a call log is created.
- Then claim queries can sort directly on `contacts.call_attempt_count`, which will scale much better as call history grows.

Why this approach
- The current lead-claim query is not timing out, so a queued background-worker architecture is probably unnecessary right now.
- The real win is reducing synchronous waits:
  - one fast first claim instead of two sequential claims,
  - one cheap count request for filter changes,
  - no notes fetch in the critical lead-advance path,
  - no unnecessary waiting before showing the next contact.

Technical details
```text
Current
Filter change -> claim RPC used as preview
Start session -> claim 25 -> claim 25 -> show first lead
Next lead -> remove lead + notes fetch + prefetch + other polling overlap

Planned
Filter change -> lightweight count RPC
Start session -> claim first chunk -> show first lead immediately
Background -> prefetch remaining buffer
Next lead -> optimistic local advance -> background release/prefetch
```

Files likely to change
- `src/hooks/useContacts.ts`
- `src/pages/DialerPage.tsx`
- `src/hooks/useContactNotes.ts` and/or dialer notes rendering
- `src/hooks/useDialpad.ts`
- new backend migration for:
  - lightweight queue count RPC
  - `call_attempt_count` support on contacts
  - trigger/function to keep that value updated
  - updated claim RPC to sort by the maintained counter

Expected result
- Faster filter changes
- Much faster “Start Dialing”
- Near-instant next-lead transitions when buffer already has leads
- Less perceived lag during call start/end
- Better long-term performance as call history grows
