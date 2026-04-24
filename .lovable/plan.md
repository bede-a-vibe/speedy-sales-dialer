

## Plan: New "Call Funnel" page — full end-to-end stats with selectable metrics

A dedicated page where you watch every step of the cold-call funnel from first dial to booked appointment, in one visual flow, with the ability to pick which metrics to monitor. Lives at `/reports/funnel` (its own sidebar entry, separate from the existing Reports tabs).

### What you see, top to bottom

**1. Filter bar** (sticky)
Date range, Rep selector, Industry/State multi-selects, "Compare to previous period" toggle. Same controls reps already know from `ReportsToolbar`.

**2. End-to-end funnel visualization** (the centerpiece)
A vertical funnel showing every stage with count, % of top of funnel, and drop-off from previous stage. The full chain in one view:

```
Unique Leads Dialed         3,180   100%
  └─ Total Dials            8,940   ─── (avg 2.8 attempts/lead)
Pick Ups                    1,820    57%   ↓ 43%
Conversations (>15s)          420    13%   ↓ 77%
Problem Awareness             190     6%   ↓ 55%
Solution Awareness             95     3%   ↓ 50%
Verbal Commitment              42     1%   ↓ 56%
Bookings Made                  37    1.2%  ↓ 12%
Showed                         24    0.8%  ↓ 35%
Closed                         11    0.3%  ↓ 54%
```

Two view modes via toggle:
- **% of top of funnel** (default — overall conversion view)
- **% of previous stage** (stage-by-stage skill view)

**3. Conversion-rate strip**
Auto-computed key ratios as cards: Dial → Pickup, Pickup → Conversation, Conversation → Booking, Pickup → Booking, Booking → Showed, Showed → Closed, Lead → Booked, Cost-per-conversation (talk time ÷ conversations).

**4. Pick your stats — customizable monitor panel**
A "+ Add metric" button opens a checklist of every available stat (grouped: Activity / Outcomes / Funnel / Conversion / Timing / Revenue). Selected stats render as a grid of cards. The selection persists per user via `localStorage`. Users can:
- Add/remove any stat
- Reorder by drag (later — not in v1)
- Toggle "compare to previous period" — each card shows delta % and a tiny sparkline

Available stats to choose from (~30 metrics):
- **Activity**: Dials, Unique leads dialed, Avg attempts/lead, Pick ups, Pick up rate, Talk time, Avg talk/dial, Avg talk/pickup
- **Outcomes**: No answer, Voicemail, Not interested, DNC, Follow-ups, Bookings made
- **Funnel**: Conversations (>15s), Problem awareness, Solution awareness, Verbal commitment, Booked
- **Conversion %**: Dial→Pickup, Pickup→Conversation, Conversation→Booking, Pickup→Booking, Lead→Booked
- **Quality**: Immediate hang-ups, Short hangups <15s, Wrong numbers
- **Outcomes (post-booking)**: Showed, No-shows, Closed, Show-up rate, Close rate
- **Revenue**: Cash collected, Avg deal value
- **Timing**: Same-day/next-day booking rate, Best pick-up hour

**5. Trend chart**
Line chart of any single metric over the date range, with a metric picker dropdown (defaults to Bookings Made). Optional second line for "previous period" comparison.

**6. Stage drop-off table**
For each funnel stage that had drops, the top 3 exit reasons (NEPQ tagged) with counts and %. Reuses existing `computeStageExitBreakdowns`.

### Bug fixes rolled in

The screenshot shows **Meeting Booked: 36, 257%** in the Conversation Funnel — that's because `booked` count uses `outcome === "booked"` over ALL filtered logs, while the funnel "top" is `reached_connection`. Many bookings happen on calls where the rep never ticked the Connection checkbox. Fix: clamp the booked count in the funnel to logs that also reached connection AND show a separate **"Booked without funnel tags"** counter underneath so you don't lose the data, just stop the broken percentage. Apply same fix to the new end-to-end funnel.

### Files

**New**
- `src/pages/CallFunnelPage.tsx` — the new page
- `src/components/funnel/EndToEndFunnel.tsx` — vertical funnel viz with two view modes
- `src/components/funnel/ConversionRateStrip.tsx` — auto-computed key ratio cards
- `src/components/funnel/CustomStatGrid.tsx` — user-picked metric grid + "+ Add metric" picker
- `src/components/funnel/MetricPickerDialog.tsx` — checklist grouped by category
- `src/components/funnel/MetricTrendChart.tsx` — single-metric line chart with metric picker
- `src/lib/funnelStatsCatalog.ts` — registry of all available metrics: `{ id, label, category, group, compute(metrics, prevMetrics?) }`. Single source for picker + cards + trend chart.
- `src/hooks/useFunnelMetricSelection.ts` — localStorage-backed selected-metric IDs (per user)

**Edited**
- `src/lib/reportMetrics.ts` — add `showed`, `noShows`, `closed`, `showUpRate`, `closeRate`, `cashCollected`, `avgDealValue` to the top-level metrics object (already exist under `appointmentPerformance.setter`, just expose flat for catalog lookup); add `previousPeriod` helper to compute deltas
- `src/lib/funnelMetrics.ts` — fix booked-stage math: only count `outcome === "booked" && reached_connection === true` for the funnel %, expose `bookedWithoutFunnelTags` separately
- `src/components/reports/ConversationFunnelPanel.tsx` — show "X bookings without funnel tags" footnote when applicable
- `src/components/AppSidebar.tsx` — add "Call Funnel" nav item under Reports
- `src/App.tsx` — register `/reports/funnel` route

### Out of scope
- Drag-to-reorder for the custom grid (v2)
- Saving named stat presets ("My Morning Dashboard")
- Exporting the funnel view as a PDF/image
- Cohort funnel (lead-source-by-source breakdown)
- Real-time updates (page reads same React Query data as Reports, refreshes on focus)

