# Auto no-answer after 4 rings

Yes — the dialer already knows live when a call is ringing vs answered (Dialpad sends it through every few seconds), so we can add a ring timer.

## What reps will see
- A small toggle on the dialer: **Auto-skip after 4 rings** (on by default, remembered per rep).
- While ringing, a countdown chip shows on the call bar (e.g. "Ringing · 12s").
- If nobody answers in ~24 seconds (4 Australian rings ≈ 6s each), the dialer hangs up, logs **No Answer**, and loads the next lead straight away.
- If the call connects, the timer stops instantly — nothing changes for live calls.
- If the rep clicks anything (outcome, hang up, notes) during ringing, the auto-skip is cancelled so it never fights the rep.

## Things to know
- Voicemail: some numbers go to voicemail before 4 rings. Those will "connect", so the timer stops and the rep logs Voicemail as now. If you want voicemails auto-skipped too, that's a separate step.
- No Answer follows existing rules: follow-ups roll forward, and the lead recycles back into the queue like any other no answer.
- Counts in productive hours exactly like a manual no answer (25s per dial).

## Technical details
- `useDialerDialpad.ts`: start a timer when `activeDialpadCallState` enters `calling`/`ringing`; clear on `connected`, `hangup`, or any rep action. On expiry call the existing `fireAndForgetHangup()`.
- `DialerPage.tsx`: on expiry run the existing outcome-log path with `no_answer` and the normal advance-to-next flow (same code as pressing the No Answer button), guarded so it fires once per call.
- Ring length as a constant (`AUTO_NO_ANSWER_SECONDS = 24`) in `src/lib/kpiStandards.ts`; toggle stored in localStorage.
- Add a small test for the 24-second threshold and the "connected cancels timer" rule.
