
## Plan: Create admin login for contact@frontendng.com

### What this does

Creates a new user account in Lovable Cloud and grants them admin access so they can use admin-only features (Targets, Dialpad Settings, GHL Sync admin pages, plus admin-gated capabilities like contact deletion, manual creation, and CSV imports).

### Credentials

- **Email**: `contact@frontendng.com`
- **Password**: `CoachJeffHotelKing`

### Steps

1. **Create the auth user via a database migration.** The migration will:
   - Insert directly into `auth.users` with the email, an encrypted (`crypt()` / `bcrypt`) version of the password, and `email_confirmed_at` set to `now()` so they can sign in immediately without a confirmation email.
   - Insert the matching `auth.identities` row (required for email/password sign-in to work).
   - The existing `handle_new_user()` trigger on `auth.users` will automatically create their `public.profiles` row (display name derived from the email prefix → `contact`).

2. **Grant admin role.** Insert a row into `public.user_roles` with `role = 'admin'` for the new user's id. This is the table the app's `useAdminAccess()` hook checks via the `has_role()` security-definer function — it gates `/targets`, `/dialpad-settings`, `/admin/ghl-sync`, and other admin-only UI.

3. **Verify.** After the migration runs, the user can go to `/auth`, sign in with the credentials above, and they'll land on the dashboard with the admin sidebar items (Targets, Dialpad Settings, GHL Sync) visible.

### What this does NOT change

- No code changes — this is data only.
- Does not touch existing users or their roles.
- Does not enable auto-confirm for future signups (only this one user is pre-confirmed).
- Does not change anything in the Custom Monitor / Segments / Bars work from the previous plan.

### Security note

Pre-confirming a user and seeding their password in a migration is fine for an internal admin you're standing up yourself. After they sign in the first time, recommend they rotate the password from a future "change password" flow (or use the existing forgot-password link on the auth page).
