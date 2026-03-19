

# Cleaner Booked Appointments View

## Problem

The current Booked tab renders every appointment as a tall card with the full outcome recording panel (textarea, deal value input, 6 buttons, calendar picker) always visible. With multiple appointments, this creates a wall of controls that's hard to scan.

## Solution

Replace the card list with a **compact table view** for booked appointments, with key info visible at a glance and an **expandable row** for outcome recording.

### What the table shows at a glance (one row per appointment)

```text
┌──────────────────┬──────────┬─────────┬────────┬──────────┬───────────┬──────────┐
│ Business         │ Date     │ Setter  │ Closer │ Status   │ Reschedules│ Actions │
├──────────────────┼──────────┼─────────┼────────┼──────────┼───────────┼──────────┤
│ Acme Plumbing    │ Mar 21   │ John    │ Sarah  │ ⚠ Stale  │ ×2        │ ▼ Expand │
│ Smith Electrical │ Mar 22   │ John    │ Mike   │ Today    │ —         │ ▼ Expand │
│ Jones HVAC       │ Mar 25   │ Sarah   │ Sarah  │ Upcoming │ ×1        │ ▼ Expand │
└──────────────────┴──────────┴─────────┴────────┴──────────┴───────────┴──────────┘
```

- Color-coded status pills: amber for Stale, red for Overdue, blue for Today, default for Upcoming
- Click row or expand button to reveal the outcome recording panel (notes, deal value, action buttons)
- Contact person, phone, and industry visible on hover or in expanded state

### Filtering on the Booked tab

Add filters above the table:
- **Closer filter** — dropdown to filter by assigned closer
- **Status filter** — All / Stale / Today / Upcoming / Overdue

### Mobile

On small screens, fall back to a condensed card layout (not the full table) — each card shows business name, date, status pill, setter/closer, with a tap-to-expand for actions.

## Files Changed

| File | Change |
|------|--------|
| `src/components/pipelines/BookedAppointmentsTable.tsx` | New component — compact table with expandable rows for outcome recording |
| `src/pages/PipelinesPage.tsx` | Replace `renderOpenItems` for booked tab with the new table component; add closer/status filters |
| `src/components/pipelines/PipelineItemCard.tsx` | No changes — still used for follow-ups and history |

## Technical Details

- Use Radix `Collapsible` (already in deps) for expand/collapse per row
- Extract the outcome recording UI from `PipelineItemCard` into a shared `BookedOutcomePanel` sub-component used by both the new table rows and the existing card
- Filter state managed locally in `PipelinesPage` with `useState`
- Stale/overdue/today logic reuses the same date-fns helpers already in `PipelineItemCard`

