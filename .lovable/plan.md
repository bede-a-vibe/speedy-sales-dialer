
# Cold-Calling Analytics Dashboard

A new top-level **Analytics** section modelled on Odin Analytics' structure, but built around the cold-calling funnel: **Dials → Conversations → Bookings → Showed → Closed → Revenue**. Internal team/admin only. Existing Reports page stays untouched.

## Route & shell

- New page at `/analytics` (admin-only via existing `useUserRole`), added to the sidebar under "Analytics".
- Header with date-range picker (reuse existing `ReportsToolbar` range logic), team-wide vs per-rep filter, and a "Showing data for [range]" strip.
- Tabbed layout matching Odin: Summary · Activity · Funnel · Rep Performance · Sources · Forecasting · Lead Tracker.

## Tabs

### 1. Summary (Executive)
Headline tile row: **Dials**, **Conversations**, **Bookings**, **Showed**, **Closed**, **Revenue (setup + first-year)**.
Secondary row: **Dial→Close %**, **$/Dial**, **Avg Dials/Close**, **Booking Show Rate**, **Show Close Rate**, **Avg Deal Value**.
- End-to-end funnel viz (reuse `EndToEndFunnel` logic, expanded).
- Monthly trend line: dials vs bookings vs closes vs revenue.
- Top channels table: dials/bookings/closes/revenue per **industry** and per **lead-list / state** (Odin's "Channel Performance" equivalent).

### 2. Activity Metrics
- Daily dial volume bar chart.
- Talk time totals + average per call.
- Connect rate, voicemail rate, no-answer rate (from `call_logs.outcome`).
- Hourly heat map (reuse `BookingHeatMap` / `PickupHeatMap`).
- Conversation depth funnel: Connection → Problem → Solution → Commitment (uses `reached_*` flags on `call_logs`).

### 3. Funnel
Dedicated full-width funnel: Dials → Conversations → Bookings → Showed → Showed&Closed.
- Conversion % between each stage, with delta vs prior period.
- Breakdown table: same funnel sliced by rep, by industry, by state.

### 4. Rep Performance (Leaderboard)
- Per-rep table with: Dials, Talk time, Conversations, Bookings, Showed, Closed, $/Dial, Dials/Close, Show%, Close%, Setup $, MRR, First-year $.
- Sortable, highlights top performer per column.
- Per-rep monthly trend mini-charts.

### 5. Sources / Segments
Odin's "Lead Sources" equivalent for cold calling — slice the funnel by:
- **Industry** (`contacts.industry`)
- **State** (`contacts.state`)
- **Trade type / work type / business size / prospect tier**
- **Buying signal strength**, **has_google_ads**, **has_facebook_ads**
Each segment shows: leads called, contact rate, booking rate, close rate, revenue, $/dial.

### 6. Forecasting
- Project next 30/60/90 days revenue based on current dial volume × current conversion rates.
- Pipeline value: open bookings × historical show rate × historical close rate × avg deal value.
- Required-dials-to-target calculator using `performance_targets`.

### 7. Lead Tracker
Searchable table of every contact with: status, last outcome, call attempts, last called, assigned rep, current pipeline stage, deal value. Filterable by funnel stage. Click-through to existing contact detail page.

## Technical

- New folder `src/components/analytics/` for tab components.
- New `src/lib/analyticsMetrics.ts` aggregating from existing tables: `call_logs`, `pipeline_items`, `contacts`, `profiles`, `performance_targets`. No new tables required.
- Reuse existing data sources: extends `reportMetrics.ts`, `funnelMetrics.ts`, `hourlyMetrics.ts`, `useBookedAppointmentsByDateRange`. Add new Supabase RPCs only if client-side aggregation gets slow on 50k+ contacts (defer until needed).
- Pull revenue from `pipeline_items.deal_value` + `monthly_recurring_value` (already populated). First-year value = `deal_value + monthly_recurring_value × 12`, consistent with `MySalesPanel` / `SalesEfficiencyPanel`.
- Date range stored in URL search params so links are shareable.
- StatCard component reused; charts via existing `recharts`.

## Out of scope (for this pass)

- Client-facing/external view (we'll add a separate read-only route later if needed).
- New database tables, new edge functions.
- Real-time updates (page is on-demand refresh).
- CSV export (can add per-table later).

## Build order

1. Page shell + routing + sidebar entry + tab skeleton.
2. Summary tab (highest value, reuses most existing code).
3. Activity + Funnel tabs.
4. Rep Performance + Sources tabs.
5. Forecasting + Lead Tracker tabs.
