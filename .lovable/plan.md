

## Plan: Dialpad Integration - Call Initiation and User Number Assignment

### What We're Building

1. **A `dialpad_settings` table** to store each user's assigned Dialpad user ID and phone number
2. **Admin UI to assign Dialpad numbers** to users (in a new settings/admin section)
3. **Dialer integration** so when "Log & Next" is clicked, the call is initiated via the Dialpad API using the user's assigned Dialpad number
4. **Call status tracking** after initiating via Dialpad

### Database Changes

**New table: `dialpad_settings`**
- `id` (uuid, PK)
- `user_id` (uuid, unique, references profiles.user_id)
- `dialpad_user_id` (text) -- the Dialpad platform user ID
- `dialpad_phone_number` (text) -- display number for reference
- `is_active` (boolean, default true)
- `created_at`, `updated_at`

RLS: admins can CRUD all rows; users can SELECT their own row.

### Edge Function Update (`supabase/functions/dialpad/index.ts`)

Add a `"log_call"` action that:
- Looks up the user's `dialpad_user_id` from `dialpad_settings`
- Initiates the call via Dialpad API with that user ID and the contact's phone number
- Returns the Dialpad call ID for status tracking

### Frontend Changes

1. **`src/hooks/useDialpadSettings.ts`** -- new hook
   - `useDialpadSettings()` -- fetch all user Dialpad assignments (admin)
   - `useMyDialpadSettings()` -- fetch current user's Dialpad config
   - `useUpsertDialpadSettings()` -- admin mutation to assign/update

2. **`src/pages/DialerPage.tsx`** -- modify `logAndNext`
   - After logging the call outcome, invoke the Dialpad edge function with the contact's phone number
   - Use the user's stored `dialpad_user_id` from their settings
   - Show toast on success/failure of Dialpad call logging
   - Display the user's assigned Dialpad number in the dialer header

3. **`src/pages/DialerPage.tsx`** -- add Dialpad number selector
   - Show the user's assigned Dialpad number near the controls bar
   - If no number assigned, show a notice

4. **Admin: Dialpad Settings panel** (new component or section in an existing admin page)
   - Table of users with their assigned Dialpad user IDs and phone numbers
   - Edit/assign Dialpad credentials per user
   - Only visible to admin role users

### File Summary

| File | Action |
|------|--------|
| Migration SQL | Create `dialpad_settings` table with RLS |
| `supabase/functions/dialpad/index.ts` | Add `log_call` action that looks up user's Dialpad ID |
| `src/hooks/useDialpadSettings.ts` | New hooks for Dialpad user settings CRUD |
| `src/pages/DialerPage.tsx` | Integrate Dialpad call on log, show assigned number |
| `src/pages/DialpadSettingsPage.tsx` | New admin page for assigning Dialpad numbers to users |
| `src/components/AppSidebar.tsx` | Add Dialpad Settings nav item for admins |
| `src/App.tsx` | Add route for Dialpad settings |

