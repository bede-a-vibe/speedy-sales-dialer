

## Connect GoHighLevel (GHL) as CRM — Dialer Push Integration

GHL becomes the source of truth for contacts, follow-ups, bookings, and call activity. The dialer pulls calling lists from GHL and pushes all outcomes back. Local tables remain for dialer session mechanics (locks, queue) but contacts and pipeline data live in GHL.

This is a large integration with multiple phases. Here is the plan broken into deliverable milestones.

---

### Phase 1: GHL Edge Function + API Key Setup

**What**: Create a `ghl` edge function that proxies all GHL API v2 calls (contacts, opportunities, calendars, tasks, notes). Store the GHL API key and Location ID as secrets.

| Item | Detail |
|---|---|
| Secret: `GHL_API_KEY` | Private Integration Token from GHL Settings > Integrations |
| Secret: `GHL_LOCATION_ID` | The GHL sub-account/location ID |
| Edge function: `supabase/functions/ghl/index.ts` | Proxy with actions: `search_contacts`, `create_contact`, `update_contact`, `add_note`, `create_opportunity`, `create_task`, `create_appointment`, `get_calendars`, `get_pipelines`, `get_smart_lists` |

---

### Phase 2: Replace Contact Source with GHL

**What**: Instead of querying the local `contacts` table for the dialer queue, pull contacts from GHL smart lists / saved searches. Keep the local `dialer_lead_locks` table for concurrency control (lock by GHL contact ID).

| File | Change |
|---|---|
| `src/hooks/useGHLContacts.ts` | New hook to fetch contacts from GHL via edge function, map to dialer-compatible shape |
| `src/hooks/useContacts.ts` | Add a GHL mode flag; when enabled, `useRollingDialerQueue` fetches from GHL instead of local DB |
| `supabase/functions/ghl/index.ts` | `search_contacts` action with pagination, smart list support |
| DB migration | Add `ghl_contact_id` column to `dialer_lead_locks` for GHL-based locking |

---

### Phase 3: Push Outcomes to GHL on Call Completion

**What**: After each call outcome in the dialer, push data to GHL in the background (same fire-and-forget pattern as current DB writes).

| Outcome | GHL Action |
|---|---|
| Any call | Add a note to GHL contact with outcome + notes + call duration |
| `booked` | Create a GHL calendar appointment + opportunity in the booking pipeline |
| `follow_up` | Create a GHL task (call/email/prospecting) assigned to the rep |
| `dnc` | Update GHL contact with DNC tag |
| `no_answer` | Add note + optionally create a follow-up task |

| File | Change |
|---|---|
| `src/hooks/useGHLSync.ts` | New hook with mutations: `pushCallNote`, `pushBooking`, `pushFollowUp`, `pushDNC` |
| `src/pages/DialerPage.tsx` | In `logAndNext` background block, call GHL sync after local DB writes |
| `src/components/QuickBookDialog.tsx` | Also push to GHL when creating bookings/follow-ups |

---

### Phase 4: GHL Settings Page

**What**: Admin page to configure the GHL connection — enter API key, select location, map pipelines/calendars, and choose smart lists for dialer queues.

| File | Change |
|---|---|
| `src/pages/GHLSettingsPage.tsx` | New page: API key input, location selector, pipeline/calendar mapping, smart list picker |
| `src/components/AppSidebar.tsx` | Add GHL Settings nav link (admin only) |
| `src/App.tsx` | Add route |
| DB migration | `ghl_settings` table to store location ID, pipeline mappings, calendar ID, smart list IDs |

---

### Phase 5: Calling Lists from GHL Smart Lists

**What**: Let admins pick which GHL smart lists feed the dialer queue. Reps see a dropdown to select their calling list (replaces industry/state filters or adds alongside them).

| File | Change |
|---|---|
| `src/pages/DialerPage.tsx` | Add smart list selector in filter bar |
| `src/hooks/useGHLContacts.ts` | Fetch contacts by smart list ID |
| `supabase/functions/ghl/index.ts` | `get_smart_lists` + `get_smart_list_contacts` actions |

---

### Technical notes

- GHL API v2 base URL: `https://services.leadconnectorhq.com`
- Auth: `Authorization: Bearer {api_key}`, `Version: 2021-07-28`
- Rate limit: 100 requests / 10 seconds per resource — the edge function should include basic retry with backoff
- Contact mapping: GHL `contactId` ↔ local `ghl_contact_id` stored on `dialer_lead_locks` and optionally on `contacts`
- Local `call_logs` and `pipeline_items` tables are kept as a local audit trail but GHL is the system of record for CRM data

### Recommended start

Phase 1 first (edge function + secrets), then Phase 3 (push outcomes) since that delivers immediate value — reps can keep dialing as normal and all activity flows to GHL. Phases 2 and 5 (pulling contacts from GHL) can follow once the push layer is proven.

Shall I proceed with Phase 1?

