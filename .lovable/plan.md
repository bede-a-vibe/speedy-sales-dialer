

## Wire GHL Sync into Dialer + Add Calendar/Pipeline Selection

The `useGHLSync` hook and `ghl` edge function already exist. Now we need to: (1) add a `ghl_contact_id` column to the `contacts` table so we can link local contacts to GHL, (2) wire the sync calls into the dialer's `logAndNext` flow, (3) add GHL calendar and pipeline selectors to the booking UI, and (4) fetch available calendars/pipelines from GHL.

---

### 1. Database migration — add `ghl_contact_id` to contacts

Add a nullable `ghl_contact_id TEXT` column to the `contacts` table. This stores the GHL contact ID so outcomes can be pushed to the correct GHL record.

```sql
ALTER TABLE public.contacts ADD COLUMN ghl_contact_id text;
```

---

### 2. New hook: `useGHLConfig` — fetch calendars and pipelines

Create `src/hooks/useGHLConfig.ts` with React Query hooks that call the existing `ghlGetCalendars()` and `ghlGetPipelines()` functions from `src/lib/ghl.ts`. These populate the calendar and pipeline dropdowns in the dialer UI.

Returns typed arrays like `{ id, name }[]` for calendars and `{ id, name, stages: { id, name }[] }[]` for pipelines.

---

### 3. Wire `useGHLSync` into `DialerPage.logAndNext`

In `src/pages/DialerPage.tsx`:

- Import and call `useGHLSync()`
- Add state for `selectedGHLCalendarId`, `selectedGHLPipelineId`, `selectedGHLPipelineStageId`
- After the existing background DB writes block (line ~191), add GHL sync calls:
  - **Every call**: `pushCallNote` with outcome, notes, duration (if contact has `ghl_contact_id`)
  - **Booked**: `pushBooking` with calendar ID, scheduled time, pipeline/stage IDs
  - **Follow-up**: `pushFollowUp` with scheduled time and method
  - **DNC**: `pushDNC`
- All GHL calls are fire-and-forget (catch and log errors, don't block the UI)

---

### 4. Add GHL calendar + pipeline selectors to dialer booking UI

In the booked outcome section of `DialerPage` (around line 629):

- Add a `<Select>` for GHL Calendar (populated from `useGHLConfig`)
- Add a `<Select>` for GHL Pipeline (populated from `useGHLConfig`)
- Add a `<Select>` for Pipeline Stage (filtered by selected pipeline)
- These appear alongside the existing "Confirm Booked Date" picker when outcome is `booked`
- Calendar selector is required for booking; pipeline is optional

---

### 5. Wire GHL sync into `QuickBookDialog`

In `src/components/QuickBookDialog.tsx`:

- Import `useGHLSync` and `useGHLConfig`
- Add calendar/pipeline selectors to the booked tab
- After the existing `handleSubmit` DB writes, fire GHL sync calls (same pattern as dialer)

---

### Files changed

| File | Change |
|---|---|
| DB migration | Add `ghl_contact_id` to `contacts` |
| `src/hooks/useGHLConfig.ts` | New — fetch GHL calendars + pipelines |
| `src/pages/DialerPage.tsx` | Add GHL sync calls in `logAndNext`, add calendar/pipeline selectors in booking UI |
| `src/components/QuickBookDialog.tsx` | Add GHL sync + calendar/pipeline selectors |
| `src/hooks/useGHLSync.ts` | No changes needed (already built) |

