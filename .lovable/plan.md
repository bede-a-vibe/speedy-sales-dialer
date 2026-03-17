
Goal

Keep Dialpad as the phone service and continue using the CRM dialer as the control surface for starting, monitoring, logging, and advancing calls.

Decision

I will not switch to a browser softphone provider. Instead, I’ll harden the existing Dialpad-based workflow so the app remains app-controlled while Dialpad stays the telephony backend.

What I found

- The current dialer already follows this architecture:
  - `src/pages/DialerPage.tsx` starts calls, polls status, supports cancel, and handles “Log & Next Lead”.
  - `src/hooks/useDialpad.ts` wraps the backend actions for call start/status/cancel.
  - `supabase/functions/dialpad/index.ts` proxies Dialpad API requests and syncs tracking data.
  - `dialpad_settings` stores the per-user Dialpad mapping, and RLS already limits self/admin access correctly.
- Admin access to the settings page is only hidden in the sidebar today; the route itself is not explicitly admin-guarded.
- There are existing reliability issues from earlier work:
  - Dialpad hangup endpoint behavior is inconsistent.
  - Status polling can hit rate limits.
  - The “Log & Next Lead” flow depends on good local queue state.

Implementation plan

1. Keep the existing Dialpad architecture
- Preserve:
  - Dialpad user assignment via `dialpad_settings`
  - app-triggered outbound calls
  - app-side call logging and transcript linking
  - the existing queue / outcomes / follow-up workflow
- Do not add a new phone provider or browser audio stack.

2. Make the Dialpad flow explicitly “app-controlled”
- Refine the dialer UX around the current provider model:
  - clear call states: calling, live, ending, ended
  - disable invalid actions while a request is in flight
  - only allow “Log & Next Lead” when the call is in a safe state for logging
- Keep the app responsible for advancing the queue even if Dialpad events arrive later.

3. Harden the backend Dialpad actions
- Review and tighten `initiate_call`, `get_call_status`, and `hangup_call` in `supabase/functions/dialpad/index.ts`.
- Add safer endpoint handling and better normalization of Dialpad response payloads.
- Add graceful fallback behavior when Dialpad returns:
  - already-ended calls
  - unsupported hangup cases
  - temporary rate limits
- Return consistent app-facing response shapes so the frontend does not have to guess.

4. Reduce rate-limit pressure
- Replace aggressive status polling with a more conservative strategy:
  - slower interval
  - no overlapping requests
  - stop polling immediately once a terminal state is reached
  - temporary backoff after repeated provider failures
- Keep webhook-based transcript/summary sync as the source of truth for post-call enrichment.

5. Tighten “Log & Next Lead”
- Ensure logging works whether a Dialpad call ID is present or not.
- Keep the immediate local queue advance already introduced, so reps are not blocked by refetch timing.
- Make sure active call state is reset correctly after:
  - successful log
  - skip
  - stop session
  - ended/cancelled call

6. Protect admin-only Dialpad settings
- Add route-level admin protection for `/dialpad-settings`, not just sidebar hiding.
- Keep the existing RLS-backed database model; no role changes are needed.

7. Improve rep-facing Dialpad setup messaging
- In the dialer, clearly show when the logged-in rep is missing an active Dialpad assignment.
- Provide a better empty/error state so reps know they need an admin assignment before starting the session.

Files I would update

- `src/pages/DialerPage.tsx`
  - refine state machine, button enable/disable logic, and status/backoff UX
- `src/hooks/useDialpad.ts`
  - normalize Dialpad action responses and errors
- `supabase/functions/dialpad/index.ts`
  - harden Dialpad API handling, reduce brittle assumptions, standardize responses
- `src/App.tsx`
  - add route guard for Dialpad settings
- `src/pages/DialpadSettingsPage.tsx`
  - optionally improve assignment empty states / guidance

Database / backend impact

- No new tables are required.
- Existing `dialpad_settings`, `dialpad_calls`, `call_logs`, and `contact_notes` already support this direction.
- Existing RLS is mostly aligned for this plan.
- I would leave schema changes out unless we discover we need a dedicated call-state audit field later.

Technical notes

- This keeps Dialpad as the phone system.
- The app remains the orchestration layer.
- Reps still use the CRM dialer to control the call workflow.
- The likely implementation shape remains:

```text
Dialer UI
  -> dialpad hook
  -> backend function
  -> Dialpad API
  -> tracking tables / call logs / notes
```

Expected outcome

- You keep Dialpad.
- Reps continue working from the CRM dialer.
- The workflow becomes more reliable:
  - fewer rate-limit failures
  - safer cancel behavior
  - stronger “Log & Next Lead”
  - clearer setup and call-state UX
  - better admin protection for Dialpad assignment management
