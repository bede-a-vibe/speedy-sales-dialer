

## Plan: Clean up Target Comparison

The Target Comparison currently uses huge full-width cards (3xl numbers, big descriptions, milestone ticks, confetti) and stacks 4 sections when a rep is selected (Rep Setter, Rep Closer, Team Setter, Team Closer). With ~10 metrics each, the panel takes a full screen of scroll just to show what's mostly redundant.

### What changes

**1. Compact row layout — replace big cards with a tight progress-row list**

Each target becomes a single horizontal row instead of a 200px card:
```
Bookings Made          37 / 55     ████████████░░░░  67%   18 to go
Pickup → Booking %     4% / 8%     ██████░░░░░░░░░░  50%   4% to go
Dials                 2,863 / 3,000 ███████████████░  95%   137 to go
```
- One line per metric, label left, actual/target middle, slim bar + % right
- ~32px tall (vs current ~180px) — fits 8 metrics in the space 1 currently takes
- Keep color coding (red/orange/blue/green based on % to goal)
- Keep the ✓ icon + green tint when complete (no confetti — too noisy in a multi-row list)

**2. Tabs instead of stacked sections**

When a rep is selected, current panel renders 4 large sections vertically. Replace with a tab strip:
```
[ My Setter ] [ My Closer ] [ Team Setter ] [ Team Closer ]
```
Default to "My Setter". Team tabs only show when relevant (rep selected).

When no rep is selected, show only `[ Team Setter ] [ Team Closer ]`.

**3. Hide derived metrics behind "Show derived" toggle**

Currently the panel shows both input metrics (Bookings Made, Pickup→Booking %) AND derived ones (Pickups, Dials, Showed, Closed Deals — auto-calculated from inputs). Default to **inputs only** (the goals reps actually act on). A small "Show derived" link expands to include the auto-calculated ones below a divider.

**4. Trim header chrome**

- Drop the per-section description ("Setter goal progress for the selected rep.") — redundant with tab label
- Single panel header: `Target Comparison · Weekly` (period as a chip)
- Remove duplicate `actual / target` text in row corner since the bar already shows it

### Files

**New**
- `src/components/targets/TargetProgressRow.tsx` — compact single-row progress component (replaces `TargetMetricCard` for this panel; cards still used on the dashboard `DashboardTargetsOverview` and Targets settings page so the original component stays untouched)

**Edited**
- `src/components/reports/TargetComparisonPanel.tsx` — replace 4 stacked `TargetSection`s with a tabbed layout; render `TargetProgressRow`s; add inputs-only filter + "Show derived" toggle; period shown as chip in header

### Out of scope
- Changing the underlying targets math or `buildTargetProgressItems`
- Touching `TargetMetricCard` / `TargetSection` (still used on Dashboard + Targets page where the bigger format makes sense)
- Adding sparklines or trend deltas (separate request)
- Editable targets inline (already exists on Targets page)

