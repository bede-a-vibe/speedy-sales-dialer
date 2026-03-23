

## Problem Analysis

Two issues identified from the screenshot and your description:

1. **Outcome buttons not working correctly** — When clicking "No Show", "Verbal Commitment", "Showed - Closed", or "Showed - No Close", the appointment is immediately marked as `completed` and disappears from the Booked tab into the History tab. There's no confirmation step and no way to add follow-up actions before the item vanishes.

2. **No follow-up scheduling per scenario** — After recording an outcome (e.g., No Show → schedule a callback, Verbal Commitment → follow up in 2 days, Showed - No Close → follow up next week), there's no way to create a follow-up pipeline item tied to that appointment.

## Plan

### 1. Add follow-up scheduling to the BookedOutcomePanel

Modify `BookedOutcomePanel.tsx` to include an optional follow-up date/time picker that appears for all outcome types (not just reschedule). When a follow-up date is set alongside an outcome, the system will create a new `follow_up` pipeline item for that contact after recording the outcome.

- Add a "Schedule Follow-up" toggle/section with a date picker and optional time
- This is independent of the outcome — you can mark "No Show" AND schedule a follow-up call

### 2. Update the outcome handler to create follow-up items

Modify `handleBookedOutcome` in `PipelinesPage.tsx` to:
- Accept an optional `followUpDate` parameter
- After recording the outcome, create a new `follow_up` pipeline item via `useCreatePipelineItem` if a follow-up date was provided
- The follow-up will reference the same contact and carry the outcome notes forward

### 3. Wire up the BookedOutcomePanel callback

Update the `onRecordOutcome` prop signature and `BookedOutcomePanelProps` to pass through the follow-up date. The `BookedOutcomePanel` will collect the follow-up date locally and pass it when any outcome button is clicked.

### Technical Details

**Files to modify:**
- `src/components/pipelines/BookedOutcomePanel.tsx` — Add follow-up date picker UI, pass follow-up date in callback
- `src/components/pipelines/BookedAppointmentsTable.tsx` — Update prop types to include follow-up date
- `src/pages/PipelinesPage.tsx` — Import `useCreatePipelineItem`, update `handleBookedOutcome` to create a follow-up item when date is provided, get current user ID from `useAuth`
- `src/lib/appointments.ts` — Update the `onRecordOutcome` type if needed

**New UI flow:**
```text
┌─────────────────────────────────────────────┐
│ [Notes textarea]                            │
│ [$] Deal value                              │
│ ☐ Schedule follow-up  [Pick date] [Time]    │
│                                             │
│ [Reschedule] [Mar 23] [No Show]             │
│ [Verbal Commitment] [$ Closed] [No Close]   │
└─────────────────────────────────────────────┘
```

When "Schedule follow-up" is checked and a date is picked, clicking any outcome button will:
1. Record the outcome on the booked appointment (mark completed)
2. Create a new `follow_up` pipeline item for that contact with the selected date
3. Show a toast confirming both actions

