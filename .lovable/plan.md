
Goal: stop the recurring “edge function errors” when Bede places calls by making the dial flow resilient when Dialpad delays returning a usable call ID.

What I found
- The frontend starts a call from `src/pages/DialerPage.tsx` and relies on `activeDialpadCallId` for status polling, hangup, logging, and blocking the next lead.
- The backend function `supabase/functions/dialpad/index.ts` uses Dialpad’s `initiate_call`, then tries only 4 quick `stats/calls` polls to discover the real `call_id`.
- If that lookup fails, the function still returns success with `state: "calling"` but no `dialpad_call_id`.
- That is the weak point: without a call ID, the UI cannot poll or hang up the live call correctly, and it can move on too early, which likely causes the later edge errors/conflicts.
- Runtime data supports this:
  - Bede has many `dialpad_calls` rows, all stuck at `sync_status = pending`
  - none are linked to `call_logs`
  - Bede’s recent `call_logs` have no `dialpad_call_id`
- I did not find matching backend error logs, which suggests the user-facing “edge function errors” are often generic function failures/retries caused by this missing-ID state rather than one single thrown exception.

Implementation plan

1. Strengthen call discovery in the backend function
- Update `supabase/functions/dialpad/index.ts` so `initiate_call` does not give up after 4 short polls.
- Improve matching logic for the newly-created call:
  - poll longer with bounded backoff
  - consider more than `limit=5`
  - prefer matching by user + recent timestamp + target number
- Return richer metadata when the call has started but the ID is still unresolved, instead of pretending the flow is complete.

2. Add an explicit “pending call resolution” state in the dialer
- Update `src/pages/DialerPage.tsx` so a call without `dialpad_call_id` is treated as “connecting / resolving”, not terminal.
- Block:
  - logging outcomes
  - auto-advance countdown
  - next-call attempts
  while the call is unresolved.
- Show clearer status text such as “Connecting to Dialpad…” or “Waiting for Dialpad to confirm call…”.

3. Add a recovery path for unresolved calls
- If the backend still cannot return a call ID immediately, add a follow-up resolution step:
  - either a dedicated frontend retry using the existing function
  - or a backend helper action that searches recent live calls for the current rep/contact
- Once found, hydrate `activeDialpadCallId` and resume normal polling/hangup behavior.

4. Make hangup/logging safer
- In `src/pages/DialerPage.tsx`, prevent `logAndNext`, `skipLead`, and auto-outcome logic from treating `null` call ID as “call ended”.
- Require one of:
  - confirmed terminal state, or
  - explicit unresolved-call timeout/failure handling
  before advancing.
- This should reduce the repeated 409/conflict situations after an unresolved placement.

5. Improve backend diagnostics
- Add structured logs inside `supabase/functions/dialpad/index.ts` for:
  - initiate request start
  - whether Dialpad returned immediate success/fallback
  - each call-ID discovery attempt
  - whether the function returned with/without `dialpad_call_id`
- Return more specific client-facing messages for unresolved call discovery vs actual Dialpad API failure.

Files to update
- `supabase/functions/dialpad/index.ts`
- `src/pages/DialerPage.tsx`
- possibly `src/hooks/useDialpad.ts` if we want to expose richer unresolved-call response types cleanly

Technical details
- Current risky condition in the UI:
  - `isCallTerminal = !activeDialpadCallId || activeDialpadCallState === "hangup"`
  - This means “no call ID” is currently treated as terminal.
- Current backend behavior:
  - after `initiate_call`, the function polls `stats/calls` only 4 times at 500ms intervals
  - if not found, it still returns `state: "calling"` without `dialpad_call_id`
- Likely root cause:
  - Dialpad has accepted the call, but call discovery is slower than the current lookup window
  - the app then loses control of that live call session

Expected outcome
- Fewer “edge function errors” during placement
- faster recovery when Dialpad is slow to expose the call record
- hangup/logging only happen against a known or explicitly unresolved call state
- fewer duplicate/no-answer logs and fewer follow-up 409 conflicts
