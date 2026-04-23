

## Plan: Per-Rep Coaching & Timing Intelligence (in Reports)

Add per-rep funnel-leak tracking and best pick-up / booking time intelligence directly inside the existing **Reports** page (`/reports`). Pure reporting — no training UI, no AI, no DB changes.

### New tab in Reports: "Rep Coaching"

Per-rep scorecards (one card per rep, sorted by dials desc; expanded view when a specific rep is selected in the existing Reports filter).

Each card shows:

1. **Funnel Leak Strip** — mini horizontal funnel (Connected → Problem → Solution → Commitment → Booked) with the biggest drop-off stage highlighted in red and `% drop` labeled.
2. **Top NEPQ Exit Reason** — e.g. "Biggest leak: *Pain not big enough* — 42% of Solution Awareness drops · 18 calls" via per-rep `computeTopCoachingCue`.
3. **Best Pick-Up Window** — top 3 hours by pickup rate (min 5 dials/hour to qualify).
4. **Best Booking Window** — top 3 hours by booking count (min 1 booking).
5. **Auto Insight Lines** — deterministic data-only one-liners:
   - "Loses 60% at Solution Awareness"
   - "Pickup rate drops 40% after 3pm"
   - "0 bookings on Mondays"
   - "Avg talk on pickups: 45s"

### Enhancements to existing Reports tabs

**Hourly / Heat Map**
- `getBookingHeatMapData` accepts optional `repUserId` so the heatmap respects the active rep filter (currently ignores it).
- New **Pick-Up Rate Heatmap** (day × hour, % intensity) alongside the booking heatmap.
- Hourly Breakdown table: add **Pick-Up %** column and a **Best Booking Hour** badge alongside the existing peak-dials badge.

**Conversation Funnel**
- Append a **Per-Rep Leak Leaderboard** table: ranks reps by their worst-stage drop %, with their top exit reason on that stage.

**Rep Comparison**
- Add columns: **Best Pick-Up Hour**, **Worst Stage**, **Top Exit Reason**.

### Files

**New**
- `src/lib/repCoachingMetrics.ts` — `computeRepCoachingScorecard`, `computeAllRepScorecards`, `computePickupHeatmapData`, `computeRepLeakLeaderboard`, deterministic insight-line generator
- `src/components/reports/RepCoachingPanel.tsx` — per-rep scorecard cards
- `src/components/reports/PickupHeatMap.tsx` — pickup-rate heatmap (mirrors `BookingHeatMap`)
- `src/components/reports/RepLeakLeaderboardTable.tsx`

**Edited**
- `src/lib/hourlyMetrics.ts` — `getBookingHeatMapData(items, repUserId?)`; add `getPickupHeatmapData`
- `src/lib/reportMetrics.ts` — extend `RepComparisonRow` with `bestPickupHour`, `worstStage`, `topExitReason`
- `src/components/reports/HourlyBreakdownTable.tsx` — Pick-Up % column + best-booking-hour badge
- `src/components/reports/BookingHeatMap.tsx` — accept optional `repLabel` for header context
- `src/components/reports/ConversationFunnelPanel.tsx` — append per-rep leak leaderboard
- `src/pages/ReportsPage.tsx` — add "Rep Coaching" tab; pass `activeRepId` into heatmap; render new Rep Comparison columns; mount Pickup Heatmap

### Technical notes

- All metrics computed client-side from already-fetched `callLogs` (with NEPQ exit-reason fields) + `bookedAppointments`. No new DB queries, no migration.
- Thresholds: ≥5 dials/hour for pickup ranking; ≥1 booking for booking ranking.
- Insight lines are deterministic rules — no AI calls.
- Respects existing date range and rep filter on `ReportsPage`.

### Out of scope
- Any training/coaching workflow UI (Reports only)
- AI-generated narratives
- Editable/dismissable insights
- Rep-vs-own historical baseline trends

