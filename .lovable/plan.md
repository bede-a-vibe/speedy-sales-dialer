## Problem

On the Call Funnel page, the **Key Conversion Rates** strip below the funnel shows wrong percentages:

- DIAL → PICKUP: shows **2%** (should be ~41%, i.e. 55 pickups / 135 dials)
- PICKUP → CONVERSATION: **3%** (should be ~53%)
- CONVERSATION → BOOKING: **1%** (should be ~10%)
- PICKUP → BOOKING: **0%** (should be ~5%)

Meanwhile the funnel above it correctly shows 135 → 55 → 29 → 3 with the right percentages in the right-hand columns.

## Root cause

In `src/lib/reportMetrics.ts`, `getReportMetrics()` accepts `from` and `to` parameters and uses them when filtering **bookings**, but it does **not** apply those bounds to `callLogs`:

```ts
const filteredCallLogs = repUserId
  ? callLogs.filter((log) => log.user_id === repUserId)
  : callLogs;
```

This means `metrics.dialer.dials`, `metrics.dialer.pickUps`, `metrics.dialer.pickUpRate`, `metrics.dialer.conversations`, etc. are computed against **every call_log row currently in the React Query cache for that hook**, not just the ones inside `[from, to]`.

When the user changes the date range, the `useCallLogsByDateRange` hook re-fetches with new bounds, but other components on the page (Reports/Custom Stats) and previous queries can leave cached rows from a wider range available, and the `previous period` compare mode also intentionally fetches a longer span (`previousFrom → dateTo`) into the same hook. In that compare-mode fetch path, `callLogs` contains both the current and previous period rows, so `dials/pickUps/pickUpRate` get inflated.

The funnel's bar counts hide the bug because they read `funnel.stages` (computed from `filteredLogs`, which IS date-filtered via `filterFunnelLogs`), while `Pick Ups` and `Unique Leads Dialed` happen to look right when the cache contains only the current range. The strip exposes the inconsistency because rates use the unfiltered denominator.

The same bug also affects:
- Custom Stat Grid (any card driven by `metrics.dialer.*`)
- Reports page KPIs (`/reports`) which reuses `getReportMetrics`
- Targets page progress (which reads `metrics.dialer.dials` and pickup rate)
- Hourly breakdown when no rep filter is active

## Fix

Make `getReportMetrics()` apply the `[from, to]` window to `callLogs` the same way it already does for bookings.

### Changes

1. **`src/lib/reportMetrics.ts`**
   - In `getReportMetrics`, after the existing rep filter, also filter by date:
     ```ts
     const filteredCallLogs = (repUserId
       ? callLogs.filter((log) => log.user_id === repUserId)
       : callLogs
     ).filter((log) => isInDateRange(log.created_at, from, to));
     ```
   - Apply the same date filter to the `repComparison` per-rep call log slices so rep rows reflect only the selected window.
   - Update `dailyVolumeMap` building to iterate the now-date-filtered array (already does, just verify).

2. **`src/lib/hourlyMetrics.ts`**
   - `getHourlyMetrics` already filters by `date.startsWith(...)` so it is fine. No change.

3. **Quick sanity check on `compareMode`**
   - In `CallFunnelPage.tsx`, `previousMetrics` passes `from: previousFrom, to: previousTo` to `getReportMetrics` while feeding it the wider `callLogs` array. After the fix, `previousMetrics` will correctly be scoped to the previous window, and `metrics` to the current window, even though both share the same fetched array. No code change needed here.

### Verification

After the change, with `From=2026-04-27` and `To=2026-04-30`:

- DB confirms 135 call_logs in range with 55 answered outcomes (`booked + not_interested + dnc + follow_up`).
- The strip will show:
  - Dial → Pickup: 41%
  - Pickup → Booking: 5%
  - Lead → Booked: 2%
- The funnel bars and right-hand percentages remain unchanged.
- Reports page totals will drop to match the date range exactly (this is the intended behavior, even though some users may have grown used to the inflated numbers).

### Out of scope

- No schema or migration changes.
- No UI changes.
- The `useCallLogsByDateRange` hook stays as-is; the fix is purely in the metric calculator so that any caller passing `from/to` gets consistent results regardless of what is in the array.
