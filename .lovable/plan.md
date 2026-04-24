

## Plan: Track "Immediate Hang-Ups" Across Dialer & Reports

The `hung_up_immediately` exit reason already exists at the Connection stage but it's buried under the NEPQ dropdown and never surfaced as a metric. Make it a first-class signal so the rep can log a hang-up in one tap and see the trend over time.

### 1. One-tap "Hung up" button in the dialer

In `ConversationProgressPanel`, add a small **"Hung up before I could speak"** quick-tag button right next to the "Stages reached" header. Tapping it:
- Sets all `reachedX` flags to `false` (the call exited at Connection)
- Sets `exitReasonConnection = "hung_up_immediately"`
- Visually highlights as active when set

Saves the rep three clicks (no need to open the NEPQ dropdown for the most common case).

### 2. New "Hang-Up Tracking" insights in Reports

**Headline KPI Strip** — add a 6th compact tile: **Immediate Hang-Ups** showing count + `% of dials` (e.g. `12 · 8%`).

**SOP Diagnostic tab** — extend the existing "Outbound Data Review" panel with a new row:
- **Immediate Hang-Ups** — count, % of dials, and a per-rep mini bar showing each rep's hang-up rate. Flag any rep ≥15% as a red flag (likely opener problem).

**Rep Coaching tab** — each rep's scorecard gets a new line:
- "🔴 Hung up before opener finished: X calls (Y%)" when ≥10% of their dials end this way, with a deterministic insight like *"Opener may be triggering hangups — review first 5 seconds."*

**Conversation Funnel tab** — the Connection-stage exit breakdown table already shows `hung_up_immediately`. Add a small **trend sparkline** above it showing daily immediate-hangup counts across the date range, so spikes are obvious.

### 3. Metric plumbing

Extend `ReportCallLog` type to include `exit_reason_connection`. Add to `ReportMetrics.dialer`:
- `immediateHangUps: number`
- `immediateHangUpRate: number` (% of dials)

Add to `OutboundDiagnosticMetrics`:
- `immediateHangUps`, `immediateHangUpRate`
- Per-rep `immediateHangUpRate` inside `RepRedFlagRow` + flag string `"high_immediate_hangups"` when ≥15%.

Update `getReportMetrics` and `repCoachingMetrics.computeRepCoachingScorecard` to compute these from `exit_reason_connection === "hung_up_immediately"`.

### Files

**Edited**
- `src/components/dialer/ConversationProgressPanel.tsx` — add quick-tag "Hung up" button
- `src/lib/reportMetrics.ts` — extend types + compute immediate hang-up counts/rates (team + per-rep)
- `src/lib/repCoachingMetrics.ts` — include immediate-hangup rate in scorecard + insight line
- `src/components/reports/HeadlineKpiStrip.tsx` — add 6th tile, expand to `lg:grid-cols-6`
- `src/components/reports/OutboundDiagnosticPanel.tsx` — add immediate hang-up row + per-rep flag
- `src/components/reports/RepCoachingPanel.tsx` — render hangup line on rep cards
- `src/components/reports/ConversationFunnelPanel.tsx` — add daily hang-up sparkline above Connection breakdown
- `src/pages/ReportsPage.tsx` — pass `exit_reason_connection` through (already in funnel logs; add to `useCallLogsByDateRange` select if missing)
- `src/hooks/useCallLogs.ts` — ensure `useCallLogsByDateRange` selects `exit_reason_connection` (it already pulls `*` for that range, so likely a no-op — verify)

### Technical notes

- All client-side computation from existing `call_logs.exit_reason_connection` column. No DB migration.
- "Immediate hang-up" is defined strictly as `exit_reason_connection === "hung_up_immediately"` (rep-tagged). We do NOT auto-infer from talk-time because Dialpad timing isn't reliable enough.
- Threshold for red flag: ≥15% of a rep's dials, minimum 20 dials to qualify (avoids noise).
- Insight line in Rep Coaching only fires at ≥10% to be actionable.

### Out of scope
- Auto-detecting hang-ups from Dialpad call duration
- Adding hang-up reason sub-categories (rude, silent, instant, etc.)
- Notifications/alerts when hang-up rate spikes

