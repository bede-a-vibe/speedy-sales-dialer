
Goal: make booked appointments capture an appointment day, let reps later record the meeting result, update both the contact and pipeline state, and ensure booked contacts do not return to the power dialer queue.

What I found
- Booked calls already create a `pipeline_items` row with `pipeline_type = "booked"`, but booked items currently do not require any schedule.
- The dialer queue only pulls contacts with `status = "uncalled"` and `is_dnc = false`, so any booked contact is already excluded once its status becomes `called`.
- The current pipeline model only has generic statuses (`open/completed/canceled`) and no place to store appointment outcomes like no-show or showed-closed.
- Contacts currently only track the original call outcome in `last_outcome`, so there is nowhere to reflect the latest booked-meeting result.

Recommended implementation

1. Extend the backend data model
- Add appointment outcome support to `pipeline_items`, likely with:
  - `appointment_outcome` enum/field for:
    - `no_show`
    - `rescheduled`
    - `showed_closed`
    - `showed_no_close`
  - optional `outcome_recorded_at`
  - optional `outcome_notes`
- Tighten validation so:
  - `booked` items require `scheduled_for`
  - `follow_up` items still require `scheduled_for`
  - completed booked items should have an appointment outcome unless canceled
- Keep roles/RLS aligned with current pipeline permissions.

2. Update dialer behavior for booked calls
- When outcome is `booked`, require:
  - assigned rep
  - appointment date
- Since you asked for date only, default the stored datetime to a consistent time so it can still live in `scheduled_for`.
- Keep the contact out of the power dialer by continuing to set `status = "called"` after the booking is logged.
- Update the booked flow copy so reps understand they are scheduling an appointment day, not just marking interest.

3. Upgrade the Pipelines page for booked appointments
- Keep Follow-ups tab mostly as-is.
- Expand the Booked tab card UI to show:
  - appointment day
  - assigned rep
  - action area for appointment result
- Add outcome actions for:
  - No Show
  - Rescheduled
  - Showed - Closed
  - Showed - No Close
- For Rescheduled:
  - reopen/update the booked item with a new appointment day
  - preserve history in notes if possible
- For other outcomes:
  - mark the booked item completed
  - save the appointment outcome and timestamp

4. Sync pipeline result back to contact record
- When a booked appointment result is recorded:
  - update the related contact’s `last_outcome` or a new “latest appointment result” field
  - keep the contact excluded from the dialer
- Best option:
  - add a dedicated contact field for appointment-stage result, instead of overloading the original call outcome enum
- This avoids mixing “booked from dialer” with “showed-closed” type meeting outcomes.

5. Surface the result in Contacts
- Add booked appointment details in the expanded contact view:
  - next/last appointment date
  - current booked pipeline state
  - final appointment outcome when recorded
- Show a clearer badge than only `called` / `uncalled`, so booked leads and completed appointments are easy to spot.

6. Reporting updates
- Keep current call outcome reporting unchanged for dialer performance.
- Add appointment reporting separately:
  - booked appointments
  - no-shows
  - reschedules
  - showed-closed
  - showed-no-close
- This prevents call KPIs from being polluted by post-appointment outcomes.

Technical design notes
- I would not put these new appointment outcomes into the existing `call_outcome` enum, because they are not call dispositions; they are appointment lifecycle results.
- I would store them on `pipeline_items` as a separate appointment outcome field.
- For “date only,” I would still save a normalized datetime in `scheduled_for` so sorting/order logic keeps working without rewriting the whole table shape.
- The power dialer exclusion is already mostly correct because it only queries `status = "uncalled"`; the main work is making sure booked contacts never get reset back into that state.

Files likely involved
- `src/pages/DialerPage.tsx`
- `src/pages/PipelinesPage.tsx`
- `src/hooks/usePipelineItems.ts`
- `src/hooks/useContacts.ts`
- `src/pages/ContactsPage.tsx`
- `src/pages/ReportsPage.tsx`
- new database migration for pipeline appointment outcome fields/enum

Validation pass after implementation
- Log a booked call in the dialer and confirm date is required.
- Confirm the booked contact disappears from the power dialer queue.
- Open Pipelines → Booked and record each result type.
- Confirm reschedule updates the appointment day correctly.
- Confirm contact view reflects the booked status/result.
- Confirm reports show appointment outcomes separately from call dispositions.
