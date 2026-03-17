
Goal: extend the Reports page to show the dialer KPIs you listed, using the existing backend tables and no schema changes.

What I found
- Call activity already lives in `call_logs` and is available in `useCallLogsByDateRange(...)`.
- Booking/appointment data already lives in `pipeline_items` with:
  - `created_at` = when the booking was made
  - `scheduled_for` = when the appointment is set for
  - `appointment_outcome` / `status` = what later happened
- The current Reports page already has date filters, KPI cards, and appointment reporting, so this fits naturally there.
- You chose:
  - Pick up = any answered call
  - Appointment reporting = show both created-date and scheduled-date views
  - New booking = first-ever booking for that contact
  - Rebooked = any later booking for a contact that already had a previous booking

Metric definitions I would implement
- Dials: total `call_logs` in range
- # of Unique Leads Dialed: distinct `contact_id` in `call_logs` for the range
- Pick Ups: call logs whose outcome implies someone answered
  - I’ll treat these as: `not_interested`, `dnc`, `follow_up`, `booked`, `wrong_number`
  - I’ll exclude: `no_answer`, `voicemail`
- Pick Up Rate: `pickUps / dials`
- # of Call Backs: `follow_up` outcome count
- Pick Up to FU %: `callBacks / pickUps`
- Total Bookings Made: booked pipeline items created in range
- Rebooked: bookings in range where the contact had an earlier booked pipeline item
- New Bookings: bookings in range where the contact had no earlier booked pipeline item
- Pick Ups to Booking %: `totalBookingsMade / pickUps`
- Same Day / Next Day Bookings: bookings made in range where `scheduled_for` is the same day or the next day after `created_at`
- Same Day / Next Day %: `sameDayNextDayBookings / totalBookingsMade`
- Appointments Scheduled: booked pipeline items whose `scheduled_for` falls in the selected range

Implementation plan
1. Expand booking report data
- Update the booking report hook so Reports can access enough fields to classify bookings correctly:
  - `id`
  - `contact_id`
  - `created_at`
  - `scheduled_for`
  - `status`
  - `appointment_outcome`
- Fetch enough booking history to determine whether a booking is first-ever vs rebooked. No database migration needed.

2. Add a reusable reporting computation layer
- In `ReportsPage`, build memoized derived datasets for:
  - call KPIs
  - booking-created KPIs
  - appointment-scheduled KPIs
- Keep formulas in one place so the UI stays readable and future metric changes are easy.

3. Redesign the Reports page into clearer sections
- Keep the current date filters.
- Add a top KPI grid for the dialer metrics you requested.
- Add tabs or clearly separated sections for:
  - Bookings Made view (`created_at`)
  - Appointments Scheduled view (`scheduled_for`)
- Preserve the existing charts where they still help, but prioritize your new KPI cards.

4. Improve labels so the numbers are understandable
- Use exact business labels matching your request.
- Add small subtext under percentage cards showing the formula, for example:
  - “pick ups / dials”
  - “follow ups / pick ups”
  - “bookings made / pick ups”

Technical notes
- No schema/RLS changes are required for this.
- The only likely code changes are in:
  - `src/hooks/usePipelineItems.ts`
  - `src/pages/ReportsPage.tsx`
  - possibly `src/components/StatCard.tsx` only if we want denser/smaller cards
- “New booking” vs “rebooked” can be implemented cleanly from existing booking history:
  - first booking for contact = new booking
  - any later booking for same contact = rebooked
- “Show both” will work best as two report views on the same page, because “bookings made” and “appointments scheduled” answer different questions.

Expected result
- A Reports page that shows the exact outbound sales KPIs you asked for, with booking metrics split into:
  - activity made by reps
  - appointments scheduled on the calendar

Open assumption I’ll use unless you want it changed
- “Total Bookings Made” will be based on when the booking record was created, not when the appointment occurs.
