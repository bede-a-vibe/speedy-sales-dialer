
Goal: streamline the dialer booking flow so reps can open the booking calendar instantly, book inline, then confirm “Booked” and move to the next lead with minimal friction.

What I found
- The dialer already supports a `booked` outcome, creates a call log, creates a `pipeline_items` record, and advances to the next lead.
- Today, “Booked” requires manually picking an appointment day in the dialer before the rep can submit.
- There is no current inline booking embed in the codebase.
- Reporting depends on `pipeline_items.created_at`, `scheduled_for`, `created_by`, and `assigned_user_id`, so the new flow must still reliably populate those fields.
- You chose:
  - Auto-open on Book
  - Try auto-detect the date
  - Keep current rep assignment behavior

Recommended implementation
1. Replace the current booked-date-only block with a dedicated inline booking panel
- When the rep clicks the `Booked` outcome, automatically expand a booking section in the dialer.
- Show:
  - the embedded calendar inline
  - assigned sales rep selector
  - appointment date confirmation area
  - final “Booked & Next Lead” action

2. Embed the calendar directly in the dialer
- Add a reusable `InlineBookingEmbed` component that:
  - renders the provided iframe
  - safely loads the external embed script once
  - sits inside a collapsible/accordion-style panel so it feels fast and focused
- Keep it on the dialer page rather than opening a modal, so reps stay in flow.

3. Use a two-step “book then confirm” workflow
- Step 1: rep books inside the embed.
- Step 2: rep clicks the CRM confirmation button (`Booked & Next Lead`) to log the result and advance.
- This keeps momentum high and avoids forcing extra navigation after the appointment is set.

4. Try date auto-detection, but design for a reliable fallback
- Because the embed is third-party and cross-origin, automatic date capture may not be available or reliable.
- Plan:
  - listen for any supported postMessage/event data from the embed if available
  - if a date is detected, prefill the appointment date automatically
  - if not, keep a lightweight manual confirmation field visible as fallback
- Important: the rep should still be able to finish quickly even if auto-detect is unavailable.

5. Simplify the booked confirmation UI
- For `follow_up`, keep the existing date/time flow.
- For `booked`, replace the current generic schedule UI with booking-specific copy:
  - “Book appointment below”
  - “Confirm booked date”
  - “Booked & Next Lead”
- Keep current assigned rep behavior, but make the rep selector visible within the booking panel so it’s part of one fast workflow.

6. Preserve backend/reporting compatibility
- Keep using the existing `logAndNext` path so:
  - `call_logs` still record outcome `booked`
  - `pipeline_items` still create `pipeline_type = "booked"`
  - `scheduled_for` is stored when known
  - reporting and targets continue working without major changes
- If no date can be auto-detected and the rep does not confirm one, decide during implementation whether to:
  - block final submit for accuracy, or
  - allow submit with a clear “date missing” warning
- I recommend requiring a confirmed date for booked appointments so reporting stays trustworthy.

Files likely involved
- `src/pages/DialerPage.tsx`
- new component such as `src/components/dialer/InlineBookingEmbed.tsx`
- possibly a small helper in `src/lib/appointments.ts` for booked-flow labels/state handling

Technical details
- Best UX pattern: auto-expand a booking panel when `selectedOutcome === "booked"`.
- Best technical pattern: load the external script in a dedicated component with cleanup guards to avoid duplicate script injection.
- Auto-detecting the appointment date may be limited by the external provider; treat it as progressive enhancement, not the core dependency.
- The safest implementation is: inline embed + optional auto-detect + manual date confirmation fallback + one-click final submit.

Expected result
- Reps click `Booked`
- Calendar drops down immediately
- They book inline without leaving the dialer
- They confirm the booking and click `Booked & Next Lead`
- The system logs the call, creates the booked appointment record, and advances to the next lead quickly
