

## Redesign Follow-ups Tab for Better Usability

The current follow-ups view dumps every item as a full card with all controls visible at once -- date pickers, time inputs, method selectors, assign dropdowns, and buttons. It's dense and hard to scan. The Booked tab already has a much better pattern (compact table rows that expand on click). We'll bring that same pattern to follow-ups.

### What changes

**1. Replace flat card list with a compact table/collapsible layout (like Booked tab)**
- Desktop: table with columns for Business, Method, Scheduled, Assigned Rep, Status, and an expand chevron
- Mobile: condensed card with tap-to-expand
- Action controls (reschedule, reassign, change method, mark complete) only appear when a row is expanded
- Color-coded status pills: "Overdue" (red), "Today" (blue), "Due Soon" (next 48h, amber), "Upcoming" (neutral)

**2. Add rep filter and summary stats bar**
- Filter bar matching the Booked tab style: rep dropdown + status dropdown + method filter (existing pills)
- Summary line: "12 follow-ups · 3 overdue · 2 today"

**3. Cleaner expanded panel**
- When a row is expanded, show a clean action area:
  - Method selector (call/email/prospecting) on the left
  - Reschedule date+time in a single row
  - Assign rep dropdown
  - "Mark Complete" button
  - Contact details (phone, website, GMB links)
- Notes shown inline without taking up card space when collapsed

**4. Sort order improvement**
- Default sort: Overdue first, then Today, then by scheduled date ascending
- Consistent with how Booked tab sorts (stale > today > upcoming)

### Technical approach

| File | Change |
|---|---|
| `src/components/pipelines/FollowUpTable.tsx` | New component: compact table with collapsible rows, status pills, filters, mirroring `BookedAppointmentsTable` pattern |
| `src/pages/PipelinesPage.tsx` | Replace `renderOpenItems` for follow-ups with new `FollowUpTable`, pass existing handlers |
| `src/components/pipelines/PipelineItemCard.tsx` | No changes needed -- kept for history/completed views |
| `src/components/pipelines/FollowUpMethodSelector.tsx` | No changes -- reused inside expanded rows |

The new `FollowUpTable` component will follow the exact same Collapsible table pattern already used in `BookedAppointmentsTable` -- same filter bar style, same expand/collapse UX, same status pill component pattern, same mobile card fallback.

