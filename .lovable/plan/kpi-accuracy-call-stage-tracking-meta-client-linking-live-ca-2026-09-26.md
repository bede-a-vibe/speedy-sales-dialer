# KPI accuracy, call-stage tracking, Meta client linking, live call review

## 1. Productive hours from Dialpad
- Hours = each rep's Dialpad call spans (start to end), joined together where the gap to the next call is 15 minutes or less (the locked cutoff stays; it now works on real call times instead of app-logged dials).
- Days worked = days with at least one Dialpad call.
- If a rep has no Dialpad calls in the period, fall back to the current app-dial method and label the row "estimated".
- Applies to the Manager KPI scorecard, period targets and Insights → Targets.

## 2. Per-call stage tracking
- The call scorer already grades every transcribed call. It will now also record three yes/no stages per call: problem found → solution presented, solution → commitment asked/got, and (for booked meetings) showed → qualified.
- Existing scored calls get backfilled from their transcripts in batches.
- Managers can override a stage in the call review dialog.
- The KPI scorecard replaces "n/a" with the real rates, and show/close targets use the rep's measured rates once they have 20+ calls; below that they keep the standard rates, marked "standard".

## 3. Link Meta-ads clients to GHL
- Look each unlinked client up in GHL by email, then phone; link matches.
- Clients with no GHL match are created in GHL (contact only), then linked.
- Report: matched, created, and any that failed.
- Their spend and deals then appear in Insights and the scorecard.

## 4. Live call review → rep's Feedback
- The review dialog and table already exist but no review has been logged yet. Log a real review end to end on one of Bede's calls, confirm it appears in the rep's Feedback on Training, and fix anything that breaks (permissions, refresh after saving).
- Add a "new feedback" badge on the Training menu item until the rep opens it.

## Technical details
- `productiveHoursFromCalls(spans)` added to kpiStandards.ts; KpiScorecard/KpiPeriodTargets query `dialpad_calls` (started_at, ended_at, user_id) instead of call_logs timestamps.
- Migration: add nullable `stage_problem_solution`, `stage_solution_commit`, `stage_showed_qualified` (boolean) to `call_scores`; coach scorer prompt extended; backfill mode on the existing scoring function.
- GHL linking via the existing GHL proxy function, writing `ghl_contact_id` with `set_ghl_contact_id`.
- Add `seen_at` to `call_reviews` for the badge.
