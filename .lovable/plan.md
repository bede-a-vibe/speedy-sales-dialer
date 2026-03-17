
Goal

Create a single “Pipelines” area that manages:
1. Follow-ups: must capture date + time and assign a sales rep
2. Booked appointments: appear in a booked pipeline, default to current rep but allow reassignment, with no required date/time

Clarified choices already applied
- Rep assignment: default to current user, but allow changing to another rep
- Booked workflow: minimal, no mandatory appointment date/time
- Layout: one pipeline page with tabs

What I would build

1. Add a dedicated pipeline table in the backend
Current follow-ups are stored only as call log rows, which is too limited for:
- rep assignment
- open/completed pipeline state
- one shared pipeline page for both follow-ups and booked items

Proposed structure:
```text
pipeline_items
- id
- contact_id
- source_call_log_id (optional)
- pipeline_type: follow_up | booked
- assigned_user_id
- created_by
- scheduled_for (required for follow_up, nullable for booked)
- notes
- status: open | completed | canceled
- completed_at
- created_at
- updated_at
```

Why this is the right approach
- keeps call history in `call_logs`
- keeps workflow/pipeline state separate
- supports reassignment, rescheduling, completion, and future expansion

2. Add backend security rules
RLS plan:
- SELECT: authenticated users can view pipeline items
- INSERT: authenticated users can create items where `created_by = auth.uid()`
- UPDATE: creator, assigned rep, or admin can update
- DELETE: admin only, or avoid delete and use `status = canceled`
- indexes on `pipeline_type`, `status`, `assigned_user_id`, `scheduled_for`

3. Update the dialer workflow
When logging a call:
- if outcome = `follow_up`
  - require date + time
  - show rep selector prefilled with current user
  - create call log row
  - create `pipeline_items` row of type `follow_up`
- if outcome = `booked`
  - keep existing call log behavior
  - also create `pipeline_items` row of type `booked`
  - rep selector shown, defaulted to current user

Dialer UI changes
- Replace current follow-up date-only picker with:
  - date picker
  - time input/select
  - sales rep select
- show validation:
  - follow-up cannot save without date/time
  - rep required for follow-up and booked
- keep keyboard shortcuts unchanged except Enter should only submit if required fields are filled

4. Create a shared Pipelines page
Replace the current dedicated follow-ups page with one page containing tabs:
- Follow-ups
- Booked

Follow-ups tab
- list open follow-up items sorted by `scheduled_for`
- badges for overdue / due today / upcoming
- show contact, rep, scheduled date-time, notes
- actions:
  - Call now
  - Reschedule
  - Reassign rep
  - Mark complete

Booked tab
- list open booked items sorted by newest first
- show contact, assigned rep, created date, notes
- actions:
  - Call/contact
  - Reassign rep
  - Mark complete

5. Keep existing data usable
Migration/backfill approach:
- create `pipeline_items`
- backfill existing follow-up call logs into pipeline items using:
  - `outcome = follow_up`
  - `follow_up_date` -> `scheduled_for`
  - `user_id` -> both `created_by` and initial `assigned_user_id`
- optionally backfill existing `booked` call logs into booked pipeline items so the pipeline is useful immediately

6. Add rep lookup support
Use `profiles` to populate the sales rep dropdown.
Implementation pattern:
- new hook to fetch selectable reps from `profiles`
- optionally filter to users with sales/admin roles if needed
- display `display_name`, fall back to email

7. Routing and navigation updates
- Add new route: `/pipelines`
- Sidebar: replace “Follow-ups” with “Pipelines”
- Keep `/follow-ups` as a redirect to `/pipelines?tab=follow-ups` so existing links don’t break

Technical details

Frontend files likely affected
- `src/pages/DialerPage.tsx`
- `src/pages/FollowUpsPage.tsx` -> refactor/replace with `PipelinesPage.tsx`
- `src/App.tsx`
- `src/components/AppSidebar.tsx`
- `src/hooks/useCallLogs.ts` or new `usePipelineItems.ts`
- `src/hooks/useContacts.ts` (only if query invalidation needs expansion)
- possibly a small shared rep selector component

Backend changes
- new migration for `pipeline_items` table + enums + indexes + RLS
- backfill SQL for existing follow-ups/booked records
- no changes to auth model
- keep roles in `user_roles` only

Behavior flow
```text
Dialer
  -> rep picks outcome
  -> if follow_up: choose date + time + rep
  -> save call log
  -> create pipeline item
  -> Pipelines page shows item in correct tab
  -> rep can reschedule / reassign / complete
```

Implementation order
1. Create `pipeline_items` schema, enums, indexes, and RLS
2. Backfill existing follow-up/booked history into pipeline items
3. Build hooks for pipeline CRUD + rep list
4. Update DialerPage to collect date/time + rep and create pipeline items
5. Build unified Pipelines page with tabs and actions
6. Update routes/sidebar and redirect old follow-ups route
7. Verify end-to-end:
   - follow-up creation
   - booked creation
   - reassignment
   - reschedule
   - mark complete
   - old data visible after backfill

Important implementation notes
- Follow-up should store full timestamp, not date-only
- Keep `call_logs` as immutable activity history; do not overload it as the pipeline source of truth anymore
- For completion, update pipeline item status instead of creating duplicate “completion” records unless you explicitly want that audit trail retained in call logs too
- Existing `follow_up_date` on `call_logs` can remain for legacy reporting, but new pipeline screens should read from `pipeline_items`
