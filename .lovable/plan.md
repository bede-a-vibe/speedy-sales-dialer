
Goal: change the dialer so that after a call actually ends, the rep gets a 30-second cooldown before the next lead is dialed automatically. During that window:
- Pause should stop the countdown and keep the finished call on screen
- “Next lead” should allow moving early, but only after an outcome is selected/logged
- The next call should not start immediately when the current contact changes anymore

What I found
- The dialer currently auto-places a call as soon as `isDialing + currentContact + dialpad_user_id` are truthy.
- There is no “call lifecycle” state on the frontend yet, so it cannot distinguish:
  - call is being placed
  - call is active
  - call has ended
  - cooldown is running
  - cooldown is paused
- There is already a `useDialpadCallStatus()` hook and a backend `get_call_status` action, so we can build this without new backend tables.

Implementation plan
1. Add explicit dialer session states in `src/pages/DialerPage.tsx`
- Introduce a small state machine, e.g.:
  - `idle`
  - `placing_call`
  - `active_call`
  - `wrap_up`
  - `cooldown`
  - `cooldown_paused`
- Track:
  - `cooldownRemaining` initialized to 30
  - `hasCallEnded`
  - `statusPollEnabled`
  - refs for countdown interval and latest call-status request

2. Detect when the current Dialpad call ends
- Use `useDialpadCallStatus()` to poll the active call while a call is in progress.
- Poll every few seconds only when `activeDialpadCallId` exists and the call is not yet ended.
- When Dialpad reports the call has ended/disconnected/hung up:
  - stop polling
  - keep the same lead on screen
  - switch into wrap-up / cooldown mode
  - start the 30-second countdown

3. Start cooldown only after call end
- Do not auto-advance immediately after logging anymore.
- Countdown begins only after provider-reported call end, per your preference.
- If the rep is still filling notes/outcome when the call ends, the timer continues while they work.

4. Add pause/resume behavior
- Replace the current “Stop Session” primary behavior during an active queue with clearer controls:
  - `Pause` during cooldown pauses only the timer
  - `Resume` restarts the timer from remaining seconds
  - keep `End Session` as a separate explicit action
- While paused, keep the finished call and entered notes/outcome visible.

5. Gate early advance correctly
- “Next Lead Now” should only work once the finished call has an outcome recorded.
- Best flow:
  - rep selects outcome
  - clicks `Log & Next Lead` during cooldown
  - call is logged immediately
  - current lead advances immediately
  - next lead is dialed right away
- Prevent skipping to the next lead during cooldown if the finished call has not been logged yet.

6. Update `logAndNext` behavior
- Split today’s combined behavior into two concepts:
  - `logCurrentCall()`
  - `advanceToNextLead()`
- If used during cooldown:
  - save call log/pipeline/contact updates
  - advance immediately
  - trigger dialing for the next contact
- If used before call ends, either disable it or relabel to avoid logging too early.

7. Prevent accidental re-dialing / race conditions
- The current auto-dial effect keys off `currentContact`; that needs stronger guards.
- Only place the next call when session state explicitly transitions to “ready for next call”.
- Clear old request keys, polling timers, and cooldown timers when:
  - ending session
  - skipping
  - advancing
  - changing filters
  - unmounting component

8. Update the dialer UI
- Add a visible post-call banner/card with:
  - “Call ended”
  - countdown timer
  - paused state
  - buttons: `Pause`, `Resume`, `Log & Next Lead`, `End Session`
- Adjust helper text/keyboard hints so reps understand the new flow.
- Optionally rename current `Skip Lead` during active wrap-up to avoid confusion with unlogged calls.

Technical details
- Main file affected: `src/pages/DialerPage.tsx`
- Existing hook to reuse: `src/hooks/useDialpad.ts` → `useDialpadCallStatus`
- Backend likely unchanged unless Dialpad status payload needs normalization
- Likely logic shape:
```text
start session
  -> place call
  -> poll call status
  -> on ended:
       show wrap-up + start 30s cooldown
       if paused: freeze timer
       if timer hits 0 and call already logged: advance + dial next
       if timer hits 0 and not logged: keep wrap-up screen, no auto-loss of data
       if rep clicks Log & Next earlier: save + advance immediately
```

Important product decision already captured
- Countdown starts after the call actually ends
- Early next-lead action requires outcome/logging first
- Pause pauses only the timer, not the whole session

Expected outcome
- Reps get a true 30-second wrap-up window after each finished call
- No immediate redial surprise
- No lost outcomes/notes
- Faster workflow for reps who finish early