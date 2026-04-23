

## Plan: Tidy Up Reports Page Layout

The Reports page has all the right data but is overwhelming — it dumps every section vertically in a single long scroll. Goal: keep every metric, just organize it so reps and admins can find what they need fast.

### Current problems
- Toolbar (date + rep filter) gets lost when scrolling.
- "Dialer KPI Snapshot" (9 stat cards) sits between toolbar and tabs, pushing tabs below the fold.
- Tab list has 6 tabs in a single wrapping row — visually noisy.
- "Target Comparison" panel renders above the KPI snapshot with no visual grouping.
- Each tab stacks 2–3 large `ReportSection` cards with similar styling, making it hard to scan.

### Layout changes

**1. Sticky filter toolbar**
Wrap the date/rep filter row in a sticky header (`sticky top-0 z-10`) with a subtle background blur so filters stay accessible while scrolling long tabs.

**2. Compact KPI strip (always visible)**
Reduce "Dialer KPI Snapshot" from 9 large `StatCard`s to a single horizontal compact strip showing the 5 headline metrics (Dials, Pick-Up Rate, Pick Ups, Talk Time, Avg Talk/Pickup). Move the other 4 (Unique Leads, Call Backs, Pick→FU %, Avg Talk/Dial) into the SOP Diagnostic tab where they belong contextually.

**3. Group tabs into 3 sections via a segmented two-level nav**
Replace the flat 6-tab row with grouped tabs:
- **Performance** → SOP Diagnostic, Bookings Made
- **Coaching** → Conversation Funnel, Rep Coaching
- **Team & Timing** → Rep Comparison, Hourly / Heat Map

Render as a primary segmented control (3 buttons) + secondary tab row underneath that swaps based on the selected group. Reduces visual load from 6 tabs to 3 + 2.

**4. Move Target Comparison into Performance group**
Currently floats above tabs. Move it as the first card inside the Performance → SOP Diagnostic view so target vs. actual sits next to the diagnostic that explains the gap.

**5. Tighten ReportSection styling**
- Reduce padding from `p-5` to `p-4`.
- Make the `title` more prominent (upgrade from `text-[10px] uppercase` muted to `text-sm font-semibold text-foreground`) and demote `description` to smaller helper text.
- Add an optional collapsible chevron on each section so users can hide sections they don't need.

**6. Two-column layout on wide screens**
Inside Hourly / Heat Map tab, render Booking Heat Map and Pickup Heat Map side-by-side on `xl:` breakpoint instead of stacked, since they share the same axes and reading them together is the point.

**7. Rep Comparison table polish**
The table has 10 columns and overflows. Add `overflow-x-auto`, sticky first column (Rep name), and right-align all numeric headers consistently.

### Files

**Edited**
- `src/pages/ReportsPage.tsx` — sticky toolbar, compact KPI strip, two-level tab nav, regroup tab contents, move Target Comparison panel
- `src/components/reports/ReportSection.tsx` — tighter padding, stronger title, optional collapsible chevron prop
- `src/components/StatCard.tsx` — add optional `compact` variant for the new headline strip (smaller padding, inline layout)

**New**
- `src/components/reports/ReportsToolbar.tsx` — extracted sticky filter bar (date from/to + rep select + loading indicator)
- `src/components/reports/HeadlineKpiStrip.tsx` — the always-visible 5-metric compact strip
- `src/components/reports/ReportTabGroup.tsx` — two-level segmented nav (group → tab)

### Out of scope
- Removing or merging any existing metric
- Changing data fetching, filters, or computations
- Adding export/PDF functionality
- Mobile-specific redesign beyond existing responsive grid behavior

