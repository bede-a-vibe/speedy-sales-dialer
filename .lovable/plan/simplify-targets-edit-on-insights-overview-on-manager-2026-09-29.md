# Simplify Targets: edit on Insights, overview on Manager

## What changes

**Insights → Targets becomes the manager's target-setting page (one set of targets)**
- Top: a single "Targets" editor. It's a table with one row per tenure stage (Day 1–30, 31–60, 61–90, 91+). The columns are the daily targets: productive hours, dials, pick-up rate, meetings set, bookings per hour, show rate and close rate. Edit a cell, then **Save** or **Reset to defaults**.
- Below that: the daily / weekly / monthly progress cards for each rep (Today / This week / This month). They show the same metrics: productive hours, dials, pick-up rate, meetings set, bookings/hr, showed and closed.
- Kept below, as they are: the scorecard, the target comparison and Forecasting (collapsed).
- **Removed:** the lower "Performance Targets" section. From now on there's only one lot of targets.
- Only admins see the edit controls. Everyone else sees the targets read-only.

**Manager → new "Targets" tab (team overview)**
- A read-only view of every rep's progress against target, for this week and this month, with the same metrics.
- Each figure is coloured green when the rep is on pace and red when behind. Days off don't count against them.
- An "Edit targets" link goes to Insights → Targets.

## Technical details
- Extend the ramp band overrides (`kpi_settings` key `ramp_bands`, `useRampBands` / `useSaveRampBands`) with `dialsPerDay` and `pickupRate`. Add defaults to `RAMP` in `kpiStandards.ts` and have `dailyTargetsFor` return dials and pickup.
- Rebuild `RampTargetsEditor` as an inline table card (replacing the dialog) and place it at the top of `InsightsTargets`.
- `KpiPeriodTargets`: add dials and pick-up rate. Pick-up rate = answered outcomes ÷ dials, using `ANSWERED_OUTCOMES`. Add a `compact`/`periods` prop so the Manager tab can reuse it.
- Remove `<TargetsBody />` from `InsightsTargets`. Leave the `performance_targets` table untouched (no data dropped).
- `ManagerPage.tsx`: add a "Targets" tab that renders the reused progress component plus a link to `/insights?tab=targets`.
