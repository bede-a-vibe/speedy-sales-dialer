
Goal: add editable daily and weekly targets for both individuals and the team, and surface progress on the Dashboard and in Reports.

What I found
- The app already has one hardcoded daily target component (`DailyTarget`) driven only by today’s call count.
- Reports already calculate the exact metrics you want to target: bookings made, show-up rate, and closed deals, with both per-rep and team views.
- There is no existing table or settings model for goals/targets, so this needs backend persistence.
- Admin-only routing/navigation already exists, so target management can follow the same pattern as Dialpad Settings.

Recommended implementation
1. Add a dedicated backend table for targets
- Create a new `performance_targets` table with:
  - `scope_type` (`individual` or `team`)
  - `period_type` (`daily` or `weekly`)
  - `metric_key` (`bookings_made`, `show_up_rate`, `closed_deals`)
  - `user_id` nullable for team rows, required for individual rows
  - `target_value`
  - timestamps
- Add RLS so:
  - authenticated users can read targets
  - admins can create/update/delete targets
- Keep roles out of profiles; continue using the existing roles table/policies pattern.

2. Add typed hooks for reading and saving targets
- Create hooks to:
  - fetch all targets for admin management
  - fetch team + current-user targets for dashboard use
  - fetch targets relevant to reports filters
  - upsert/delete targets as admin
- Reuse the existing React Query mutation/invalidation patterns already used in settings/pipeline hooks.

3. Build an admin target management page
- Add a new admin page in the sidebar, similar to Dialpad Settings.
- Include:
  - team daily and weekly goals
  - per-rep daily and weekly goals
  - fields for bookings, show-up rate, and closed deals
- Use one simple grid/table editor so admins can maintain all goals in one place.

4. Refresh the Dashboard with goal progress
- Replace the current single-purpose `DailyTarget` with a broader target summary area.
- Show:
  - my daily goals
  - my weekly goals
  - team daily goals
  - team weekly goals
- For each metric, display target vs actual and progress.
- Use the current logged-in user for individual progress and all users combined for team progress.

5. Extend reporting to include target comparisons
- Add target-vs-actual summary cards/bars near the top of Reports.
- When “All reps” is selected:
  - show team targets
  - optionally also show rolled-up individual totals for comparison
- When a single rep is selected:
  - show that rep’s individual targets
  - still allow team target context in a secondary section if helpful
- Daily reports should compare against daily targets; ranges spanning a week should compare against weekly targets, or use an explicit period switch for clarity.

6. Add a small metrics layer for goal progress
- Create a shared helper that converts existing report metrics into target progress values:
  - bookings made → `metrics.bookingsMade.totalBookingsMade`
  - show-up rate → setter/closer show-up rate (needs a defined attribution choice)
  - closed deals → likely `showed_closed`
- This avoids duplicating calculations across dashboard and reports.

Important design decision to lock in during implementation
- “Show-up rate” and “closed deals” need consistent attribution:
  - safest default:
    - bookings = setter-created bookings
    - show-up rate = setter show-up rate
    - closed deals = closer showed_closed count
- This matches the app’s existing setter/closer split and keeps targets meaningful.

Technical details
- Backend:
  - add new table + enums/checking via migration
  - enable RLS and admin write policies
- Frontend files likely involved:
  - new hooks for targets
  - new admin targets page
  - `src/App.tsx` route update
  - `src/components/AppSidebar.tsx` nav update
  - `src/pages/DashboardPage.tsx`
  - replace/refactor `src/components/DailyTarget.tsx`
  - `src/pages/ReportsPage.tsx`
  - possibly a new reusable target progress card/list component
- Prefer storing rate targets as numeric percentages (e.g. `70`) and counts as integers.

Suggested rollout order
1. Create target schema + RLS.
2. Add target hooks and types.
3. Build admin target management page.
4. Add dashboard target summary for individual/team daily + weekly.
5. Add report target comparison section.
6. Align labels, progress states, and empty states when no targets are configured.

Expected outcome
- Admins can set daily and weekly goals for each rep and the team.
- Reps can see their own targets and the team target progress on the dashboard.
- Reports can compare actual performance against goals using the same underlying metrics.
- Team goals can be shown both as manually defined targets and as the rolled-up sum of individual targets, since you requested both.
