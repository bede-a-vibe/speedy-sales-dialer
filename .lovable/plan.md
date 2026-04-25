## Plan: Coach role + demo mode + coach-safe dialer

### What this delivers

`contact@frontendng.com` becomes a **coach** account that sees every screen and every button (Contacts, Pipelines, Reports, Funnel, Targets, GHL Sync, Dialpad Settings, Dialer) exactly as an admin does, can open every form and click every action, but **cannot write to the live database**. Writes are intercepted in the UI with a friendly "Demo mode — change not saved" toast that summarizes what would have happened, AND blocked at the database level by RLS as a hard safety net.

### 1. Database — new role + safety net (migration)

- Add `'coach'` to the `app_role` enum.
- Add `public.is_admin_or_coach(_user_id uuid)` security-definer helper returning `has_role(uid,'admin') OR has_role(uid,'coach')`.
- Extend SELECT policies to include coach where they aren't already open to all authenticated users:
  - `dialpad_settings` — add coach to view policy.
  - `dialer_lead_locks` — add a new SELECT policy for coach (so the dialer page can show the queue state).
  - `pending_ghl_pushes` — add coach to admin read policy.
  - `dialpad_calls` — extend SELECT policy to coach.
- Add new RPC `public.preview_dialer_leads(...)` — same signature/scoring as `claim_dialer_leads` but does NOT insert into `dialer_lead_locks`. Returns `{ total_available_count, claimed_contacts }`. Restricted to coach/admin.
- **No INSERT/UPDATE/DELETE policies are modified.** Coach has zero write access at the DB layer because no policy names the `coach` role.

### 2. Switch Jeff's account (data operation)

- Find `user_id` for `contact@frontendng.com` in `auth.users`.
- Delete `(user_id, 'admin')` row from `public.user_roles`.
- Insert `(user_id, 'coach')` row.

### 3. Frontend — role hooks (`src/hooks/useUserRole.ts`)

Extend with:
- `useIsCoach()` — true when roles include `coach`.
- `useCanViewAdmin()` — true for admin OR coach (used for sidebar Admin section + admin-only routes).
- `useCanWrite()` — true only for admin (used to gate every write action).
- `useDemoMode()` — true when coach (no admin), used by interception wrapper.

### 4. Demo-mode write interception (`src/lib/demoMode.ts` — new file)

- Export `interceptDemoWrite(actionName: string, summary: string): boolean` — when called inside a coach session, shows the toast `🎓 Demo mode — would [actionName]: [summary]` and returns `true` (signaling caller to skip the real write).
- Export `useDemoGuard()` hook returning a wrapped helper bound to current role.
- All call sites add a single early-return guard: `if (demoGuard("delete contact", contact.business_name)) return;` before the Supabase mutation runs.

Wrap these call sites:
- **Contacts** (`ContactsPage.tsx`, `ContactDetailPage.tsx`): create, edit, delete, status change, repair drift, DNC toggle, add note, manual transcript upload, import CSV (`UploadPage.tsx`).
- **Pipelines** (`BookedOutcomePanel.tsx`, `PipelinesPage.tsx`, `FollowUpsPage.tsx`): record outcome, reschedule, assign, complete follow-up.
- **Targets** (`TargetsPage.tsx`): bulk save, delete target.
- **Call openers** (`CallOpenersManager.tsx`): create, update, delete, toggle active.
- **Dialpad settings** (`DialpadSettingsPage.tsx`): upsert, delete, GHL user mapping save.
- **GHL sync** (`GhlSyncPage.tsx`): start, stop, resume.
- **Quick Book** (`QuickBookDialog.tsx`): submit (booking + follow-up), create new contact.
- **Dialer** (`DialerPage.tsx`, `useDialerSession.ts`, `useCallLogs.ts`, `usePipelineItems.ts`, `DecisionMakerCapture.tsx`, `useContactNotes.ts`): log call, create pipeline item, schedule follow-up, decision-maker save.

Buttons stay visible and clickable for coach so Jeff sees the full workflow — only the actual mutation is short-circuited.

### 5. Sidebar + route gating

- `AppSidebar.tsx`:
  - Use `useCanViewAdmin()` instead of `useIsAdmin()` to render the Admin section (Reports, Call Funnel, Targets, GHL Sync, Dialpad Settings).
  - When `useIsCoach()`, show a small amber "COACH" badge next to the SalesDialer logo.
- `ProtectedApp.tsx`:
  - Rename `AdminRoute` → `AdminOrCoachRoute` and switch its check from `isAdmin` to `useCanViewAdmin()`. Targets, Dialpad Settings, GHL Sync all become coach-accessible (read-only via RLS + demo mode).

### 6. Coach-safe dialer (`DialerPage.tsx` + new `useCoachQueuePreview` hook)

When `useIsCoach()`:
- Render a sticky amber banner at the top of `DialerPage`: *"🎓 Coaching Session — calls and outcomes are not recorded. This is read-only demo mode."*
- Replace `useRollingDialerQueue` with new `useCoachQueuePreview({ filters })` that:
  - Calls `preview_dialer_leads` RPC (no locks).
  - Buffers 25 leads, advances locally on "next/skip".
  - No heartbeat, no lock release, no `dialer_lead_locks` writes.
- `DialpadCTI` renders with `autoInitiateCall={false}` and `phoneNumber={null}` — iframe loads so Jeff sees the real CTI panel, but no auto-dial.
- Outcome buttons + "Log Call" + booking flow remain clickable; clicks route through demo-mode interception.
- `useDialerDialpad` short-circuits in coach mode (no Dialpad API calls, no `dialpad_calls` writes).
- "Start Session" / "Stop Session" still work (purely local state in coach mode).

### 7. What this does NOT change

- Admin users keep full live access — every admin write policy is untouched and continues to name `admin`.
- Sales reps — no behavior change.
- The Custom Monitor / Bar Comparison / End-to-end Funnel work from earlier turns is not modified.
- No auto-confirm changes for new signups.
- No password rotation for Jeff's account.

### 8. Security guarantees

Two independent layers:
1. **UI demo-mode interception** — clean UX, no surprise errors, readable toast feedback.
2. **RLS lockdown** — even if Jeff opens devtools and POSTs directly to Supabase, every INSERT/UPDATE/DELETE policy is checked against the `admin` role only and rejects coach writes at the database.

### Files touched

- New migration: enum extension, helper function, SELECT policy additions, `preview_dialer_leads` RPC.
- Data migration: role swap for `contact@frontendng.com`.
- New: `src/lib/demoMode.ts`, `src/hooks/useCoachQueuePreview.ts`.
- Modified: `useUserRole.ts`, `AppSidebar.tsx`, `ProtectedApp.tsx`, `DialerPage.tsx`, `useDialerSession.ts`, `useCallLogs.ts`, `usePipelineItems.ts`, `useContactNotes.ts`, `useDialerDialpad.ts`, `ContactsPage.tsx`, `ContactDetailPage.tsx`, `UploadPage.tsx`, `PipelinesPage.tsx`, `FollowUpsPage.tsx`, `BookedOutcomePanel.tsx`, `TargetsPage.tsx`, `CallOpenersManager.tsx`, `DialpadSettingsPage.tsx`, `GhlSyncPage.tsx`, `QuickBookDialog.tsx`, `DecisionMakerCapture.tsx`.

Approve and I'll build it.