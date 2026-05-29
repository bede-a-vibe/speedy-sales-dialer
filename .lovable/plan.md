# Sales Efficiency: Dial → Sale and Revenue per Dial

## What we're building

A new "Sales Efficiency" view that answers:
- How many dials did it take to close a sale?
- What is the dial → sale rate?
- How much revenue (one-off + recurring) has each rep generated?
- What is the **revenue per dial** (both setup-only and including MRR)?

Plus, properly record your 4 signed clients so the numbers exist.

## The 4 signed clients (matched in DB)

| Business | Phone | Contact | Booking date |
|---|---|---|---|
| Atek Electrics | +61423328225 | Alec | 06/05/2026 |
| Electripol | +61418182724 | Jeremy | 05/05/2026 |
| OneAU Energy | +61487166358 | Darren | 28/04/2026 |
| Wired Up Innovations | +61481734946 | Tom | 08/04/2026 |

All four are currently `booked / open` with no outcome and no deal value, all created by the same user (you). They need to be flipped to `showed_closed` with the deal value recorded.

## Step 1 — Schema: add MRR column

Pipeline items today only have `deal_value` (one-off). To accurately separate setup vs recurring per your decision:

```text
pipeline_items
  + monthly_recurring_value  numeric  NULL   -- e.g. 1500
   deal_value                numeric  NULL   -- one-off / setup, e.g. 1000
```

Update `validate_pipeline_item()` trigger so `monthly_recurring_value` is also cleared unless `appointment_outcome = 'showed_closed'` (mirroring how `deal_value` is handled).

## Step 2 — Backfill the 4 deals

For each of the four pipeline_items rows above, set:
- `appointment_outcome = 'showed_closed'`
- `deal_value = 1000` (landing page setup)
- `monthly_recurring_value = 1500` (monthly retainer)
- `outcome_recorded_at = now()`

The existing `sync_pipeline_outcome_to_contact()` trigger will then move each contact's `status` to `closed`.

## Step 3 — Sales Efficiency metrics

Extend `src/lib/reportMetrics.ts`:

```text
sales: {
  closes              // count of showed_closed in range (created_by = rep)
  setupRevenue        // sum(deal_value)
  monthlyRecurring    // sum(monthly_recurring_value)
  firstYearValue      // setupRevenue + monthlyRecurring * 12
  dialToCloseRate     // closes / dials  (%)
  revenuePerDial      // setupRevenue / dials
  firstYearValuePerDial // firstYearValue / dials
  avgDialsPerClose    // dials / closes
}
```

All scoped to the existing rep filter and date range (same plumbing as `repComparison`). `dials` reuses the already-filtered `callLogs`.

## Step 4 — UI

**Reports page** — new `SalesEfficiencyPanel` rendered under the existing KPI strip:
- 4 tiles: Closes • Dial → Sale % • $/Dial • Avg Dials per Close
- Sub-row: Setup Revenue • MRR • First-Year Value
- Respects the existing rep selector and date range.

**Dashboard** — new compact "My Sales" panel under `DashboardQuickStats`, hardcoded to the logged-in user, lifetime-to-date:
- Closes • $/Dial • Dial → Sale % • Total Revenue (setup + MRR-so-far)

Both reuse the same `getReportMetrics` engine — no duplicate math.

## Technical notes

- Migration adds the column, updates the trigger, and uses a data migration script for the 4 backfill rows (handled via the insert tool after migration approval so types regen first).
- `repComparison` rows get the new `sales` block too, so the existing rep table can later add a Revenue column.
- No new tables, no new RLS — `pipeline_items` policies cover the new column automatically.

## Not in scope

- Editing MRR from the booking UI (we can add a "Monthly recurring" input to `BookedOutcomePanel` in a follow-up if you want users to set it themselves; for now the 4 rows are seeded via the backfill).
- Churn / cancellation tracking — MRR is treated as active indefinitely.
