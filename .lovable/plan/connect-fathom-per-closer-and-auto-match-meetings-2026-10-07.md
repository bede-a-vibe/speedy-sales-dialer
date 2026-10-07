# Connect Fathom per closer and auto-match meetings

## What closers will see
- **Settings → Fathom** (new card on their profile/settings page): "Connect Fathom" — the closer pastes their own Fathom API key (Fathom → Settings → API). Shows Connected / last synced / Disconnect. The key is never shown again after saving.
- **Manager → KPIs & targets**: a small "Fathom" status next to each closer (Connected / Not connected / last sync), so you can chase anyone who hasn't hooked it up.
- **Appointment window + Completed cards**: matched meetings show the Fathom recording link and summary automatically, with a "Matched by Fathom" label. A closer can unlink a wrong match or pick the right Fathom meeting from a short list.

## How matching works
Every 15 minutes, for each connected closer:
1. Pull their recent Fathom meetings (last 14 days on first run, then new ones only).
2. Match each to that closer's appointment by:
   - attendee email or phone matching the contact, or business name in the meeting title, and
   - start time within 90 minutes of the appointment time.
3. Best single match wins; ambiguous ones are left for the closer to pick.
4. A match fills the recording link, Fathom summary and marks the meeting as **showed evidence** — if no outcome is logged yet, the card shows "Fathom says this meeting happened — log the result" (it won't set the outcome on its own).
5. Due meetings with no Fathom recording get flagged "No Fathom recording — possible no-show" to help catch unlogged no-shows.

## Technical details
- New table `fathom_connections` (user_id, encrypted api key, last_synced_at, status, last_error). RLS: users see only their own row's status columns; the key column is never selectable from the browser — written and read only by the edge function (service role).
- New table `fathom_meetings` (fathom id, user_id, title, start/end, attendees, share url, summary, matched pipeline_item_id, match_confidence). RLS: owner + admin/coach read.
- Edge function `fathom`: actions `connect` (validates key by calling Fathom's meetings endpoint before saving), `disconnect`, `sync` (per user or all), `link`/`unlink`. JWT validated in code; Zod input checks.
- pg_cron job every 15 min calls `fathom` sync for all connected closers.
- Matched recording written to the existing pipeline_items recording field so show/close tracking picks it up unchanged.

## You'll need
Each closer creates their own key in Fathom (Settings → API) and pastes it in once. No shared key needed.
