

## Plan: Fix the Booking Flow (3 connected bugs)

The booking flow is broken in 3 places at once. The screenshot you sent matches edge function logs showing GHL rejecting our calendar requests — that's why no slots appear, why the appointment isn't created, and ultimately why you can't mark the lead as booked in the dialer.

### Root causes (confirmed from edge logs + code)

**1. Free slots call fails → no times shown → can't satisfy required field**
GHL's `/calendars/{id}/free-slots` endpoint requires `startDate` and `endDate` as **millisecond Unix timestamps**. We're sending date strings like `"2026-04-28"`. Edge logs show repeated `422: "startDate must be a number"` errors today (4:04, 4:05, 4:09 UTC). That's why the dialog says *"No available slots for this date."*

**2. Booked pipeline stage is hardcoded as empty → form blocks submit**
`GHL_PIPELINE_CONTRACT.booked` has `pipelineId: ""` and `stageId: ""`. The dialer's submit button is disabled until `ghlStageId` is set, but the auto-default code only fills it when the saved contract IDs match — which they never do because they're empty. So the "Pipeline Stage" dropdown always says *"Select stage"* and the **Booked & Next Lead** button stays disabled.

**3. `create_appointment` is missing `endTime`**
`useGHLBookingSync` sends `startTime` only. GHL's appointment endpoint requires `endTime` too — so even if you manage to submit, the GHL appointment creation 422s and you end up booking manually in GHL.

### Fixes

**A. Convert free-slots params to ms timestamps** (`supabase/functions/ghl/index.ts`)
In `getCalendarFreeSlots`, accept the date string (e.g. `"2026-04-28"`) and convert to ms-since-epoch for the day's start (00:00) and end (23:59:59) in the requested timezone before passing to GHL. Returns slots properly so the time dropdown populates.

**B. Resolve the booked pipeline + stage dynamically + persist them**
- Update `findDefaultBookedPipeline` / `findDefaultBookedStage` (already in `useGHLConfig.ts`) so the dialer auto-selects the **Sales & Growth Sessions** pipeline + **Booked Appointment** stage by *name lookup* from the live GHL pipelines API (no longer relying on the empty hardcoded IDs).
- Once resolved, write the discovered IDs back into `GHL_PIPELINE_CONTRACT.booked` at runtime via a small in-memory cache, so future renders skip the lookup.
- In `DialerPage`, the existing auto-select effect already calls `defaultBookedStage` — it will now actually return a stage, so the dropdown auto-populates and the submit button enables.

**C. Add `endTime` to appointment creation** (`src/hooks/ghl/useGHLBookingSync.ts`)
Compute `endTime = startTime + appointment duration` (default 30 min, configurable). Pass both to `ghlCreateAppointment`. If the calendar has a `slotDuration` returned from `get_calendars`, use it; otherwise default 30 min.

**D. Soft-fail GHL booking, but still mark lead booked locally**
Even with A/B/C fixed, if the GHL appointment ever fails (network, locked calendar, etc.) the rep should still be able to log the outcome. Currently `pushBooking` is already fire-and-forget (`.catch(() => {})`), but the user can't even reach that point because of bug #2. After bug #2 is fixed, the lead will save locally even if GHL push fails — and we'll surface a non-blocking toast: *"Saved locally — GHL booking failed, please verify in GHL"* with the error message.

**E. Helpful empty-state message in the slot picker**
Replace *"No available slots for this date"* with: *"No GHL slots returned. You can still pick a manual time below — the appointment will be logged."* (The manual time input already works; users just don't realize it's allowed.)

### Files

**Edited**
- `supabase/functions/ghl/index.ts` — convert `getCalendarFreeSlots` to ms timestamps
- `src/shared/ghlPipelineContract.ts` — comment empty IDs as fallback-only; add `getBookedPipelineFallback()` helper
- `src/hooks/useGHLConfig.ts` — make `findDefaultBookedPipeline` / `findDefaultBookedStage` cache the resolved IDs after first lookup
- `src/hooks/ghl/useGHLBookingSync.ts` — compute and pass `endTime` to `ghlCreateAppointment`; surface failures via a non-blocking toast instead of fully silent
- `src/pages/DialerPage.tsx` — improve the "no slots" message; keep manual time input always usable

### Out of scope
- Adding a new manual-vs-GHL booking toggle
- Changing the calendar embed UI
- Reworking pipeline mapping for non-booked outcomes
- Backfilling old pipeline_items with GHL opportunity IDs (separate task)

