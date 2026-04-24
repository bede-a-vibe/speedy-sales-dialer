

## Plan: Fix Booking Tracking — Make What Matters Actually Count

Two distinct problems are both hiding your real activity. Both need fixing.

### Problem 1: Bookings Made Today ≠ Appointments Scheduled Today

Looking at today's data:
- You booked **OneAU Energy** at 4:46pm (logged in dialer ✅) for an appointment on **27/04**
- You booked **Blake / Tiagra Electrical** at ~1:15pm in GHL manually (never reached dialer)
- Today's Reports shows **Bookings: 0**

That zero is because the `Bookings` KPI strip is filtering `pipeline_items` by `scheduled_for` (the appointment date) instead of `created_at` (when you booked it). For a setter, **what matters is "how many bookings did I make today?"** not "how many appointments are happening today?"

**Fix in `src/lib/reportMetrics.ts`:**
- The headline `bookingsMade.totalBookingsMade` already filters by `created_at` correctly (`bookingsMadeInRange`) — but the **Rep Comparison's `Bookings` column** (which is what the screenshot shows in the bottom table) is using `setterAppointments` filtered by `scheduled_for`. Switch the Rep Comparison "Bookings" count to be **bookings created in range** (matches what a setter actually did that day).
- The headline KPI strip's `BOOKINGS` tile in `HeadlineKpiStrip.tsx` should pull `bookingsMade.totalBookingsMade` (which uses created_at) — verify it's wired correctly. Right now the screenshot shows the strip doesn't even include a Bookings tile.

**Add to the headline strip:** A 7th tile **"BOOKINGS MADE"** showing `totalBookingsMade` for the date range — this is the #1 KPI for a setter and it's currently missing entirely from the always-visible strip.

### Problem 2: Blake's Call Was Never Logged

Blake's contact (`Tiagra Electrical Services`) in the database:
```
status: uncalled
last_called_at: null
meeting_booked_date: null
ghl_contact_id: phdJdRIhXApyP8wanYWV  ← linked to GHL ✅
```

Yet the booking exists in GHL. This means: you dialed Blake, booked the meeting manually in GHL during the call, but when you went to mark "Booked" in the dialer, **nothing got saved** — likely because:
- The Conversation Progress requirement (added last turn) blocks submit when no stages are checked
- Or the dialer auto-advanced / lost state when you tabbed away to GHL
- Or the submit silently failed and the rep moved on

**Fixes in `src/pages/DialerPage.tsx`:**

1. **Make submit-blocked state LOUD.** When `canSubmit` is false, the disabled button currently gives no feedback on click. Add a tooltip + a visible red banner above the action bar listing exactly what's missing (we already compute `submitReadinessItems` — surface it inline, not just in dev tools).

2. **Don't lose the in-progress lead when tabbing to GHL.** Persist the active dialer session state (current contact, selected outcome, conversation progress, follow-up date/time) to `sessionStorage` on every change. On mount, rehydrate. So tabbing to GHL to book and coming back resumes exactly where you were.

3. **Add a "Quick Book Recovery" button.** If the rep dials a contact, books in GHL, and the call_log somehow doesn't get saved, give them a one-click *"I just booked this in GHL"* button on the contact card. It writes the call_log + pipeline_item retroactively without needing the active session state.

### Problem 3: Reports KPIs Don't Reflect Cold-Calling SOP

The current strip shows: Dials, Pickups, Pickup Rate, Talk Time, Avg Talk/Pickup, Immediate Hang-Ups. **Missing the things that matter most to a cold caller:**

- **Bookings Made** (today's bookings, by `created_at`)
- **Pickup → Booking Rate** (already computed as `pickUpsToBookingRate`, just not displayed in the strip)
- **Conversations** (calls that reached at least Connection stage — uses `reached_connection = true`)
- **Conversation → Booking Rate** (bookings ÷ conversations — the truest "skill" metric)

**Fix in `src/components/reports/HeadlineKpiStrip.tsx`:**
Restructure the strip to two rows:
- Row 1 (Activity): Dials, Pickups, Pickup Rate, Talk Time
- Row 2 (Outcomes): **Conversations**, **Bookings Made**, **Pickup → Booking %**, **Conversation → Booking %**, Immediate Hang-Ups

### Problem 4: Pipeline Items Created in GHL Aren't Mirrored

Blake's GHL appointment exists but no `pipeline_items` row exists for him in our DB. Without a record, it's invisible in our reporting. The `ghl-webhook` edge function should ideally catch GHL appointment-created events and create a matching pipeline_item, but that's a bigger task. **For now**, the Quick Book Recovery button (Problem 2 fix #3) covers this manually until webhook ingestion is built.

### Files

**Edited**
- `src/lib/reportMetrics.ts` — Rep Comparison "Bookings" column to use `created_at` filter, not `scheduled_for`. Add `conversations` count (call_logs where `reached_connection = true`) and `conversationToBookingRate` to the dialer metrics.
- `src/components/reports/HeadlineKpiStrip.tsx` — Restructure to 2 rows; add Bookings Made, Conversations, Pickup→Booking %, Conversation→Booking %.
- `src/pages/DialerPage.tsx` — Visible "missing fields" banner above the disabled submit button; sessionStorage persistence for active call state (current contact, outcome, progress, follow-up date/time/notes); rehydrate on mount.
- `src/components/ContactCard.tsx` — Add small "I booked this in GHL" recovery button (visible when contact is linked to GHL but `last_called_at` is null or status is uncalled). Opens a tiny dialog: appointment date/time + notes → writes `call_logs` (outcome=booked) + `pipeline_items` (booked, status=open) + updates contact.

### Out of scope
- Building a GHL → Supabase webhook listener for appointment-created events (separate larger task; covered manually by recovery button for now)
- Backfilling old missed bookings from GHL history
- Conversation = "reached_connection" definition change (sticking with current `reached_connection = true` flag)

