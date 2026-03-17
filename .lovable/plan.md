

## Add Dials, Pickups, and Pickup-to-Booking Rate to Performance Targets

### What changes

The existing performance targets system supports 3 metrics: `bookings_made`, `show_up_rate`, `closed_deals`. We need to add 3 more: `dials` (count), `pickups` (count), and `pickup_to_booking_rate` (percentage). These all already exist as computed values in `ReportMetrics.dialer` and `ReportMetrics.bookingsMade`, so no database schema changes are needed — the `metric_key` column is free-text.

### Why it matters
- **Dials** — raw activity volume; benchmarks rep effort
- **Pickups** — answered calls; at team level reveals phone number health (e.g. 30% dial-to-pickup = healthy)
- **Pickup-to-Booking Rate** — conversion efficiency; matters most at individual rep level

### Plan

**1. Extend `src/lib/performanceTargets.ts`**
- Widen `PerformanceTargetMetricKey` union to include `"dials" | "pickups" | "pickup_to_booking_rate"`
- Add 3 new entries to `PERFORMANCE_TARGET_METRIC_DEFINITIONS`:
  - `dials`: label "Dials", description "Total calls made", `isRate: false`
  - `pickups`: label "Pickups", description "Answered calls (excl. no answer/voicemail)", `isRate: false`
  - `pickup_to_booking_rate`: label "Pickup → Booking %", description "Bookings made / pickups", `isRate: true`
- Extend `PerformanceActualMetrics` interface with `dials`, `pickups`, `pickup_to_booking_rate`
- Update `getPerformanceActualMetrics()` to map from `ReportMetrics`:
  - `dials` → `metrics.dialer.dials`
  - `pickups` → `metrics.dialer.pickUps`
  - `pickup_to_booking_rate` → `metrics.bookingsMade.pickUpsToBookingRate`

**2. Update `src/pages/TargetsPage.tsx`**
- No code changes needed — the form already iterates `PERFORMANCE_TARGET_METRICS` and `PERFORMANCE_TARGET_METRIC_DEFINITIONS`, so the new metrics will appear automatically in the dropdown and table.
- Update the placeholder hint to also show `%` for `pickup_to_booking_rate`.

**3. Update `src/components/targets/DashboardTargetsOverview.tsx`**
- No code changes needed — it already uses `buildTargetProgressItems` which iterates all metrics.

**4. Update `src/components/reports/TargetComparisonPanel.tsx`**
- No code changes needed — same reason.

### Files to edit
- `src/lib/performanceTargets.ts` — extend types, definitions, and actual-metrics mapper

### No database migration needed
The `performance_targets.metric_key` column is `text`, so new metric keys are stored without schema changes.

