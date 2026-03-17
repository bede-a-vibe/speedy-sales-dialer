
Goal

Add an inline booking experience to the power dialer so a rep can schedule the appointment while still on the phone, without leaving the dialer.

Plan

1. Add an inline booking widget component
- Create a small reusable component for your calendar embed.
- Render the iframe as React JSX instead of raw HTML.
- Load the external resize/embed script only when the widget is shown.

2. Show the widget only for the “booked” outcome
- In `DialerPage`, reveal the booking widget as soon as the rep selects `booked`.
- Keep all other outcomes unchanged.

3. Place the widget inline in the dialer flow
- Because the current right-side action column is fairly narrow, render the booking widget in a dedicated inline panel below the main dialer controls instead of squeezing it into the small sidebar card.
- This keeps the rep on the same screen and makes the calendar usable during the call.

4. Keep the current internal appointment tracking for now
- Keep the existing “Assigned Sales Rep” and “Appointment Day” fields for booked calls.
- Keep the current `Log & Next Lead` flow and validation.
- This preserves the existing booked-pipeline creation and rep performance reporting until automatic calendar sync is added later.

5. Improve booked-call guidance
- Add helper copy so reps understand the intended sequence:
  - book in the inline calendar
  - confirm/select the appointment day in the app
  - log the call and move to the next lead
- If useful, slightly rename the booked section text so it feels like a live scheduling workflow rather than just a date picker.

Files to update

- `src/pages/DialerPage.tsx`
- new component: `src/components/BookingCalendarEmbed.tsx`

Technical details

- Use a dedicated React component for the iframe and script loading.
- Avoid `dangerouslySetInnerHTML`.
- Keep current submit rules for booked calls, since `pipeline_items.scheduled_for` is still required by the current workflow.
- No backend or database changes are needed for this phase.
- Later, auto-sync can replace the manual date confirmation by updating booked appointments from booking-system events.

Implementation outcome

After this change, when a rep marks a call as `booked`, they will be able to open and use the calendar directly inside the dialer while staying on the call, then finish logging the appointment in the existing workflow.
