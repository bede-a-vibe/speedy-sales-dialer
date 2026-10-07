# Team settings consolidation + rep Fathom connectors

## 1. One "Team & settings" page (admins)
Merge Team, Dialpad Settings and User Roles into a single page at Team, with simple tabs:

- **People** – every user in one table: name, email, role (Setter / Closer / Coach / Admin, changeable inline), Dialpad user linked, Fathom connected yes/no, last sign-in. Actions per row: change role, link Dialpad user, reset password, remove.
- **Dialpad** – company Dialpad connection, webhook status, caller-ID pool. Only the settings actually in use; drop duplicated status cards.
- **Connections overview** – who has connected Fathom (read-only for admins; keys never shown).

Sidebar admin section loses "Dialpad Settings" and "User Roles"; old links redirect to the matching tab so nothing breaks.

## 2. Connectors page each rep can reach
- Keep **Connectors** in the main sidebar for every signed-in user, placed under the user's name menu as well so it is easy to find.
- Fathom card per rep: paste **API key** and **webhook secret**, Test & save, Disconnect, last sync time, number of meetings matched.
- When the webhook secret is saved, show the rep a copyable webhook URL to paste into Fathom, so new meetings match within seconds instead of waiting for the 15-minute sync.
- Each rep's meetings only match that rep's appointments (as closer).

Note: the Connectors link already exists in the preview; if you are looking at the live site, it appears after publishing.

## 3. Tidy pass (first round)
- Remove empty/unused admin pages and duplicate panels found during the merge (e.g. old Targets page left over from KPIs & targets).
- Consistent page headers, spacing and empty states on the merged pages.
- Larger app-wide clean-up listed as a follow-up so we agree on scope before removing features.

## Technical details
- New `src/pages/TeamSettingsPage.tsx` with tabs composing existing pieces from `TeamPage`, `RolesPage`, `DialpadSettingsPage`; `/dialpad-settings` and `/admin/roles` redirect to `/admin/team?tab=...`. Delete unused `TargetsPage` route if unreferenced.
- Migration: add `webhook_secret` to `fathom_connections` (not granted to browser roles, like the API key).
- New `fathom-webhook` edge function: URL carries the connection id; verifies Fathom's signature with that rep's secret, upserts the meeting into `fathom_meetings` and runs the existing matcher for that user.
- `fathom` function: save/test accepts optional webhook secret; status returns `has_webhook` and webhook URL.
