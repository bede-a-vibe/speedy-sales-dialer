

## Plan: Benchmark contact categories side-by-side in the Custom Monitor

### What you'll get

A new "Compare by" picker in the Custom Monitor toolbar. When set to "None" (default), the monitor behaves exactly as it does today. When set to a category (Industry, State, Business Size, etc.), the table changes from a single "Selected period" row into one row **per category value you've picked**, with the same metric columns you've already selected. Same metrics, same date range, same rep filter — just sliced by category so you can see how Plumbers stack up against Electricians, or NSW vs VIC, in one glance.

A second control next to it lets you pick **2-6 specific values** from a multi-select dropdown (e.g. tick "Plumbers", "Electricians", "Builders"). Only those rows render. This avoids the table blowing up to 20+ industries and gives you full control over the comparison.

### Categories available (matching dialer filters)

Pulled directly from the dialer's `AdvancedFilters.tsx` so the benchmark dimensions stay aligned with how you actually segment leads:

- **Industry / Trade Type** (`contacts.trade_type`, falling back to `contacts.industry`)
- **State** (`contacts.state`)
- **Business Size** (`contacts.business_size`)
- **Work Type** (`contacts.work_type`)
- **Prospect Tier** (`contacts.prospect_tier`)
- **Buying Signal Strength** (`contacts.buying_signal_strength`)
- **Phone Type** (`contacts.phone_type`)
- **Has Google Ads** (`contacts.has_google_ads`)
- **Has Facebook Ads** (`contacts.has_facebook_ads`)

The "Has DM Phone" filter is a derived boolean (`dm_phone IS NOT NULL`), and the GBP rating / review count tiers are numeric ranges — both supported the same way (computed grouping function, not a raw column read).

### Where the data comes from

Currently the funnel page already loads:
- All `call_logs` in the date range (with `contacts(business_name, industry)` joined)
- All `pipeline_items` in the range
- A count of `contacts` for lead-age buckets

To benchmark by category we need each call log to know the category value of its contact. Two options:

1. **Extend the existing `useCallLogsByDateRange` join** to also pull the columns we benchmark on (`trade_type, state, business_size, work_type, prospect_tier, buying_signal_strength, phone_type, has_google_ads, has_facebook_ads, dm_phone, gbp_rating, review_count`). One change, no extra request, marginal payload increase.
2. Lazy-fetch per category dimension on demand.

I'll go with **option 1** — it's a single hook update, the columns are small text fields, and there's no per-interaction loading flicker when switching dimensions. Same approach for `pipeline_items` (so per-category booking counts work) by adding the same `contacts(...)` join.

### How the table renders

The existing `CustomStatGrid` table currently renders one "Selected period" row plus optional "Previous period" and "Δ Change" rows. I'll extend it so:

- When **Compare by = None**: identical to today.
- When **Compare by = Industry** (etc.) and 3 values picked: 3 rows, each labelled with the category value (e.g. "Plumbers", "Electricians", "Builders"). The first column changes from "Period" to the category name.
- The **Previous period / Δ Change rows are hidden** in compare mode (mixing time comparison with category comparison would be confusing — pick one).
- A small **"Total" row at the bottom** summing the picked categories so you can sanity-check that the slice covers most of your activity.
- Sortable by any metric column (already supported by the table) so you can quickly see "which industry has the highest Pickup → Booking?".

The "Cards" view stays as it is — comparison only applies in Table mode (it's the only layout that scales to 6 rows × N metrics cleanly).

### How metrics are computed per category

The trick is that `getReportMetrics(...)` currently runs on the full set of call logs. To get per-category metrics I'll:

1. Compute a `categoryFor(log)` function based on the chosen dimension (e.g. `(log) => log.contacts?.state ?? "—"`).
2. For each picked category value, filter `callLogs` and `bookedItems` to rows where the contact matches that value, then run the existing `getReportMetrics(...)` on that subset.
3. Render one row per resulting `ReportMetrics` object using the same `STAT_CATALOG` formatters that already power the single-row view. **No metric-definition changes needed** — every column you've picked will Just Work, including the conversation-tagging-launch-clipped ones from the previous fix.

Performance: with ~3000 call logs and 6 categories that's 6 × full-pass aggregation in JS. Each pass is ~5-10ms, so total is well under 100ms — fine for a client-side compute. If it ever gets slow we can memoize on `(dimension, valueSet, dateRange, repId)`.

### UI: where the controls live

Two new controls in the Custom Monitor toolbar, placed to the left of the existing "Customize columns" button:

```
[Compare by: None ▾]  [Values: Plumbers, Electricians, Builders ▾]  | Table | Cards | Customize columns
```

- **Compare by**: single-select dropdown of the 9 dimensions plus "None".
- **Values**: multi-select chip picker of values present in the loaded data for the chosen dimension. Hidden when Compare by = None. Capped at 6 selections (with a hint "Maximum 6 categories"). Defaults to the top 3 by dials when you first switch dimensions, so the table is never empty.

Both selections persist to `localStorage` like the view-mode preference already does, keyed per dimension so switching back to a dimension restores the values you last picked.

### What this does NOT change

- Doesn't change how Conversion Rate Strip, End-to-End Funnel, Custom Monitor's "Cards" view, or any other report renders — comparison is opt-in and lives entirely inside the Custom Monitor table.
- Doesn't change which metrics are available or how they're computed for each row — same `STAT_CATALOG` definitions you already see.
- Doesn't change the dialer, dashboard, targets, or any other page.
- Doesn't change the database schema or any RPCs — purely client-side derivation.
- Comparison is mutually exclusive with the existing **Compare to previous period** toggle — when you pick a category dimension, the previous-period rows are hidden (and vice versa). The toggle is disabled with a tooltip "Switch off Compare-by to enable previous-period comparison".

### Files I'll touch

1. `src/hooks/useCallLogs.ts` — extend the `contacts(...)` join in `useCallLogsByDateRange` to include the benchmark columns.
2. `src/hooks/usePipelineItems.ts` (or wherever booked items are loaded for the funnel page — I'll check on implementation) — same `contacts(...)` join extension.
3. `src/lib/reportMetrics.ts` — accept an optional `contactFilter: (log) => boolean` (or just rely on caller-side pre-filtering, which keeps the function pure). I'll go with pre-filtering — no signature change.
4. `src/lib/benchmarkDimensions.ts` (new, ~80 lines) — defines the 9 dimensions, each with `{ id, label, getValueFromCallLog, getValueFromBookedItem, listAvailableValues }`. Centralizes the "what does Industry mean" logic so both the dropdown and the row computation read from one place.
5. `src/components/funnel/CustomStatGrid.tsx` — add the two new controls, render multi-row table when comparing, hide previous-period UI in compare mode.
6. `src/components/funnel/CompareByPicker.tsx` (new) — small wrapper around the existing `MultiSelect` for the values picker.
7. `src/pages/CallFunnelPage.tsx` — wire the new state into `CustomStatGrid` and recompute per-category metrics.

### Out of scope

- Comparing dimensions across **different date ranges** (e.g. Plumbers in March vs Plumbers in April) — that's a date-vs-date comparison, not a category one.
- Saving/sharing benchmark presets — selections persist locally only.
- Charts / heatmaps for the comparison — table only, per your answer.
- Adding the comparison to the Dashboard, Reports SOP page, or any other surface — Custom Monitor only.
- Backfilling missing `business_size` / `prospect_tier` etc. on contacts — categories with empty values will show up as a "—" row if anyone picks them; we already saw most enrichment columns are empty, so the most useful initial dimensions will be **Industry**, **State**, and **Phone Type** until enrichment is populated.

