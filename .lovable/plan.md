

## Plan: Full GHL slot picker for booking appointments

### What we're building
Replace the manual date/time picker in the booking form with a GHL-native slot picker that fetches available time slots from the GHL calendar API. Add an appointment title field and auto-assign the team member from the rep's GHL user ID.

### GHL Calendar Free Slots API
The LeadConnector API provides `GET /calendars/{calendarId}/free-slots?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&timezone=Australia/Sydney` which returns available appointment slots grouped by date.

### Changes

**1. Add `get_free_slots` action to the GHL edge function** (`supabase/functions/ghl/index.ts`)
- New function: `getCalendarFreeSlots(apiKey, calendarId, startDate, endDate, timezone)`
- Calls `GET /calendars/{calendarId}/free-slots` with date range and timezone params
- New action case: `"get_free_slots"` dispatches to this function

**2. Add client-side wrapper** (`src/lib/ghl.ts`)
- `ghlGetFreeSlots(calendarId, startDate, endDate, timezone)` — calls the edge function

**3. Create `useGHLFreeSlots` hook** (`src/hooks/useGHLFreeSlots.ts`)
- React Query hook that fetches available slots for a given calendar + date
- Accepts `calendarId`, `date` (Date object), `timezone` (default `"Australia/Sydney"`)
- Queries a single day's slots (startDate = endDate = selected date)
- Returns `{ slots: Array<{ startTime: string; endTime: string }>, isLoading }`
- Refetches when calendar or date changes; disabled when either is missing

**4. Add appointment title state** (`src/pages/DialerPage.tsx`)
- New state: `appointmentTitle` (string, default empty)
- Input field labelled "Appointment Title" with placeholder "(eg) Appointment with [Contact Name]"
- Auto-populated with contact name when outcome switches to "booked"
- Passed to `pushBooking` as the `title` parameter
- Reset on lead advance

**5. Replace time input with slot dropdown** (`src/pages/DialerPage.tsx`)
- Keep the existing date picker (calendar popover) — it works well
- Replace the `<Input type="time">` with a `<Select>` dropdown populated by `useGHLFreeSlots`
- Each slot rendered as "3:40 pm - 3:55 pm" (formatted from ISO times)
- Show loading skeleton while slots are fetching
- Show "No slots available" message if the API returns empty
- When a slot is selected, set both `followUpTime` and a new `selectedSlotEnd` state
- Pass the slot's `startTime` ISO string as the `scheduledFor` value

**6. Auto-assign team member** (`src/hooks/useGHLSync.ts`)
- `pushBooking` already receives the rep's info, but the `ghlCreateAppointment` call doesn't pass `assignedUserId`
- Add the rep's `ghlUserId` to the appointment payload so GHL shows the correct team member
- Update `PushBookingParams` to include optional `ghlUserId`
- Wire `myGhlUserId` from `DialerPage.tsx` into the `pushBooking` call

**7. Apply same changes to QuickBookDialog.tsx**
- Add appointment title field
- Add slot picker (replacing time input)
- Pass `ghlUserId` for team member assignment

### Technical details
- The GHL free slots API uses `YYYY-MM-DD` format for dates
- Timezone parameter ensures slots match the rep's local time (AEST)
- Slots are returned as ISO strings; we format them to "h:mm a" for display
- The slot picker is disabled until both a calendar and date are selected
- Preset buttons (Tomorrow 9:00, etc.) will still work by setting the date and auto-selecting the nearest available slot
- Pipeline/stage selectors remain unchanged — only the time selection and title are affected

