## Make "I booked this in GHL" count as a dialer booking with a call time

Right now the button already creates a `call_logs` row with `outcome=booked` + a `pipeline_items` row, so it does technically log. The gap is that the call is stamped at "now" instead of when you actually dialled, so it falls into the wrong hour/day in Reports and the heat map.

### Changes to `QuickBookRecoveryButton.tsx`

1. **Add a "Call time" field** to the dialog (date + time picker), defaulting to now. Label it "When did you make the call?" so it's clear this is the dial time, not the appointment time.
2. **Keep the existing "Appointment date/time"** field for when the meeting is booked for.
3. On submit:
   - Insert into `call_logs` with `created_at = callTime` so it attributes to the right hour/day in Reports, hourly metrics, leaderboards, and heat maps.
   - Set `contacts.last_called_at = callTime` (instead of `now()`).
   - Pipeline item, contact status, and `meeting_booked_date` continue to use the appointment time.
4. **Toast confirmation** updated to say "Booking logged — counted as a call at {callTime}, appointment {appointmentTime}".

### Validation

- Call time must be ≤ now (can't log a future call).
- Appointment time can be future or past (matches current behavior — you backfill past meetings too).

### Out of scope

- No DB schema changes.
- No GHL push from this button (it stays a local log; GHL already has the booking since the user made it there).
- No changes to the dialer flow itself.
