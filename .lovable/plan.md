

## Plan: Breakdown by category — compare funnel metrics across Industries, States, Reps

A "Breakdown" feature on the Call Funnel page that splits every metric by a category dimension you choose (Industry, State, Trade Type, Work Type, or Rep) — exactly like Meta Ads Manager's Breakdown dropdown. Pick "Industry" and you instantly see Electricians vs Plumbers vs HVAC side by side for any metric.

### What you see

**1. New "Breakdown" control in the toolbar**

Next to the Rep selector, add a "Breakdown" dropdown:
```
Breakdown by: [ None ▾ ] [ Industry ] [ State ] [ Trade Type ] [ Work Type ] [ Rep ]
```
Default `None` keeps the page exactly as it is today. Pick anything else and a new breakdown table appears, plus the Custom Monitor and Trend chart get a per-group view.

**2. Breakdown comparison table (the centerpiece for this feature)**

When breakdown is active, a new `ReportSection` titled "Breakdown by Industry" (or whichever dimension) renders a table:

```
Industry         Dials  Pickups  Pickup%  Convs  Bookings  Pickup→Book%  Show%   Cash
─────────────────────────────────────────────────────────────────────────────────────
Electricians     1,240    386     31%      94      18         4.7%       62%   $4,200
Plumbers           890    198     22%      52      11         5.6%       54%   $2,800
HVAC               520    112     22%      28       4         3.6%       50%   $  900
Renovators         340     71     21%      19       2         2.8%       50%   $  450
Builders           280     54     19%      12       1         1.8%       —     $    0
─────────────────────────────────────────────────────────────────────────────────────
Total            3,270    821     25%     205      36         4.4%       58%   $8,350
```

- **Columns**: same metrics already selected in the Custom Monitor — your column choices apply here too
- **Sortable**: click any column header to sort (default: Dials desc)
- **Top N + "Other"**: groups beyond top 10 collapse into an "Other" row to keep readable
- **Color-coded best/worst**: per column, best value gets a green tint, worst gets a red tint (only when ≥3 groups have data)
- **Click a row** to filter the page to just that group (sets a hidden filter — clear with an "X" chip at top)

**3. Custom Monitor → table with breakdown columns**

When breakdown is on, the existing Custom Monitor table flips: instead of "Selected period / Previous period / Δ" rows, it renders **one row per group** with metrics as columns. Same data as the breakdown table — kept in sync. (When breakdown is off, behaves as today.)

**4. Trend chart → multi-line by group**

When breakdown is active, the metric trend chart draws **one colored line per group** (top 5 groups, others greyed). Pick "Bookings Made" with breakdown=Industry → one line each for Electricians, Plumbers, etc. across the date range.

**5. End-to-end funnel & conversion strip**

Stay as today (overall view) — these are the "summary" of the period. Adding 5 funnels side-by-side gets noisy. The breakdown table covers per-group funnel comparisons.

### How it works

**Dimension extractors** (`src/lib/funnelBreakdown.ts` — new):
- `getDimensionValue(log, dim)` returns the group value: `industry` and `trade_type`/`work_type`/`state` come from the joined `contacts(...)` on call logs and a contact lookup map for booked items
- For booked appointments: extend `useBookedAppointmentsByDateRange` to include `contacts(industry, state, trade_type, work_type)`
- `groupBy(logs, bookings, dim)` returns `Map<groupValue, { logs, bookings }>` — then each group is fed through existing `getReportMetrics` + `computeFunnel`. Zero new metric math.

**Group cap & "Other"**: top 10 by dial volume by default, rest into "Other". Configurable via a small "Show: Top 10 / Top 25 / All" control.

### Files

**New**
- `src/lib/funnelBreakdown.ts` — dimension definitions (`{ id, label, extract(log/booking) }`), `groupByDimension(logs, bookings, dim, opts)`, helpers for top-N + Other rollup
- `src/components/funnel/BreakdownTable.tsx` — sortable comparison table, best/worst color hints, "Total" footer row, click-row-to-filter

**Edited**
- `src/hooks/usePipelineItems.ts` — `useBookedAppointmentsByDateRange` adds `contacts(industry, state, trade_type, work_type)` to the select
- `src/components/reports/ReportsToolbar.tsx` — add `breakdown` + `onBreakdownChange` props with a dropdown (Industry / State / Trade Type / Work Type / Rep / None)
- `src/pages/CallFunnelPage.tsx` — wire breakdown state, render `BreakdownTable` when active, switch Custom Monitor and Trend to per-group views, add "filtered to {group}" chip when row clicked
- `src/components/funnel/CustomStatGrid.tsx` — accept optional `breakdownGroups` prop; when provided, render rows-per-group instead of period rows
- `src/components/funnel/MetricTrendChart.tsx` — accept optional `breakdownGroups` prop; when provided, render multi-line series

### Out of scope
- Two-level breakdown (e.g. Industry × State)
- Saving named breakdown views
- Exporting the breakdown table to CSV (likely a follow-up)
- Per-group end-to-end funnel visualization (table covers comparison; full vertical funnels per group is too much screen real estate for v1)

