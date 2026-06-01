## Goal

Extend booked-appointment outcomes from 5 to 7 so reps can mark exactly what happened after the meeting, and roll the new outcomes through Reports and Analytics.

## New outcome set (UI labels)

Existing kept: **No Show**, **Reschedule**, **Verbal Commitment**, **Showed – Closed** (rename label to **Close**), **Showed – No Close** (rename label to **No Close**).

New:
- **Second Meeting Booked** — opens a booking dialog to schedule the follow-up meeting + assign closer. Original appointment is marked completed with this outcome; a new `booked` pipeline_item is created.
- **No Close Follow-up** — completes the appointment with this outcome and prompts the rep to pick a follow-up date + method (call/email). Creates a `follow_up` pipeline_item with the rep-chosen date (no 2-day auto default).

## Database

New migration adds two values to the `appointment_outcome` enum:

```sql
ALTER TYPE appointment_outcome ADD VALUE IF NOT EXISTS 'second_meeting_booked';
ALTER TYPE appointment_outcome ADD VALUE IF NOT EXISTS 'no_close_follow_up';
```

Update `sync_pipeline_outcome_to_contact()` trigger:
- `second_meeting_booked` → contact status `booked`, NO auto follow-up insert (the new booked pipeline_item is created from the client with date/closer).
- `no_close_follow_up` → contact status `follow_up`, NO auto follow-up insert (client inserts the follow_up pipeline_item with rep-chosen date/method).

Leave existing `no_show` / `showed_verbal_commitment` auto-2-day-follow-up behavior alone.

## Frontend

### `src/lib/appointments.ts`
Add the two new entries to `APPOINTMENT_OUTCOME_OPTIONS` and labels. Rename `showed_closed` label to "Close", `showed_no_close` to "No Close".

### `src/components/pipelines/BookedOutcomePanel.tsx`
- Add two buttons: **Second Meeting Booked**, **No Close Follow-up**.
- **Second Meeting Booked** click → opens a sub-dialog with date+time picker and closer select; on confirm: records outcome `second_meeting_booked` on current item AND creates a new `pipeline_items` row (`pipeline_type='booked'`, scheduled_for=picked, assigned_user_id=picked closer).
- **No Close Follow-up** click → reveals the existing follow-up scheduler section (date + time + method) inline; on save records outcome `no_close_follow_up` AND creates the `follow_up` pipeline_item with the chosen date/method via existing `onRecordOutcome` (already supports followUpDate + followUpMethod params).

### `src/lib/pipelineMappings.ts`
Add GHL sync mapping entries for the two new outcomes (mirror to appropriate GHL stages — same logic as showed_no_close for the no-close-follow-up case, and same as a fresh booking for second_meeting_booked).

### Reporting

`src/lib/reportMetrics.ts`:
- Add `second_meeting_booked` and `no_close_follow_up` to `appointmentOutcomeCounts` initializer.
- `showed` denominator stays the same (showed = closed + no_close + verbal_commitment + no_close_follow_up + second_meeting_booked — since all of these mean the prospect attended).
- Expose new counters: `secondMeetingsBooked`, `noCloseFollowUps`.

`src/lib/analyticsMetrics.ts`:
- Include both new outcomes in "resolved" filters (alongside the existing `!== "no_show" && !== "rescheduled"` checks).
- Add to Funnel + Rep Performance breakdowns as distinct buckets.

### Visual surfaces
- Funnel tab: add two new bars/segments.
- Rep Performance tab: show per-rep counts for the new outcomes.
- Sales Efficiency panel (Reports): "Second Meetings Booked" tile and "No Close → Follow-up" tile next to existing Close/No Close.

## Out of scope

- No changes to call_logs outcomes (dialer dispositions) — these are appointment-only outcomes.
- No changes to existing No Show / Reschedule / Verbal Commitment behavior.
- No retroactive backfill of historic appointments.
