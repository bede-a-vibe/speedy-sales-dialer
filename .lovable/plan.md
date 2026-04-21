

## Plan: Outbound Data Review Dashboard (SOP-aligned)

Add a new **"SOP Diagnostic"** tab to `ReportsPage` that surfaces the outbound metrics from the SOP we don't already track, plus extend a few existing metrics. All read-only, computed from `call_logs` + `pipeline_items` + `contacts` already loaded.

### What's already covered (no work needed)
- Pickup Rate, Total Talk Time, Avg Talk/Dial, Avg Talk/Pickup
- Funnel: Connect → Book → Show → Close (Pipeline Funnel tab)
- Hourly heatmap of bookings (Hourly / Heat Map tab)
- Rep comparison (Rep Comparison tab)
- Disposition breakdown per rep (Bookings Made tab)

### What's new (SOP gaps to close)

**1. Add to `src/lib/reportMetrics.ts`** — new `outboundDiagnostic` block on `ReportMetrics`:
- **Contact Rate (per lead)** = unique leads spoken to ÷ unique leads attempted
- **Unique Dial Rate** = unique leads dialed ÷ total dials (sweet spot 30–50%)
- **Avg Attempts per Lead** = dials ÷ unique leads
- **Lead Age Penetration (P1–P5)** = % of leads in queue that have received 1, 2, 3, 4, 5+ attempts (uses `contacts.call_attempt_count`)
- **Calls/Hour vs Connections/Hour** — extend `getHourlyMetrics` to also return connections per hour (already returns dials/bookings; add answered count)
- **Call duration diagnostics** — count of:
  - `<15s` hangups (opener problem)
  - `<2 min` hangups (no pain established)
  - `>30 min` calls dispositioned not_interested / dnc (slow DQ — bad sign)
- **Per-rep disposition red flags** — flag reps whose `not_interested` rate, `dnc` rate, or short-hangup rate is >1.5× team average

**2. New component `src/components/reports/OutboundDiagnosticPanel.tsx`**

Layout:

```text
┌──────────────────────────────────────────────────────────────┐
│ SYSTEM HEALTH (read top-to-bottom — SOP order)               │
├──────────────┬──────────────┬─────────────┬─────────────────┤
│ Pickup Rate  │ Contact Rate │ Unique Dial │ Avg Attempts    │
│ 18%          │ 47%          │ 38%         │ 2.6 / lead      │
│ ✓ healthy    │ ✓ strong     │ ✓ sweet spot│                 │
└──────────────┴──────────────┴─────────────┴─────────────────┘

LEAD AGE PENETRATION (P1–P5)
P1 (1 attempt)  ████████░░░░ 42%
P2 (2 attempts) ██████░░░░░░ 28%
P3 (3 attempts) ████░░░░░░░░ 18%
P4 (4 attempts) ██░░░░░░░░░░  8%
P5+ (5+)        █░░░░░░░░░░░  4%

CALL DURATION DIAGNOSTICS
< 15s hangups: 23 (opener issue)
< 2 min hangups: 47 (qualification issue)
> 30 min DQs: 4 reps flagged (review transcripts)

PER-REP RED FLAGS
Rep            Not-Int %   DNC %   <15s hangup %   Flag
Jane Doe       42%         12%     31%             ⚠ Opener review
John Smith     22%          4%      8%             ✓
```

Each metric carries an SOP-aligned interpretation badge (✓ healthy / ⚠ review / ✗ broken) using the SOP's targets (Contact Rate ≥50% strong, Unique Dial Rate 30–50% sweet spot, etc.).

**3. Extend `src/lib/hourlyMetrics.ts`** — add `connections` field (count of `ANSWERED_OUTCOMES`) to the hourly row, and update `HourlyBreakdownTable` to show "Calls/Hr vs Connections/Hr" as adjacent columns. This directly answers the SOP "where are dials clustered vs connections clustered" question.

**4. Wire it into `ReportsPage`** — add a new tab `<TabsTrigger value="sop-diagnostic">SOP Diagnostic</TabsTrigger>` placed first (it's the SOP-mandated reading order).

### Interpretation thresholds (from SOP)
- Pickup Rate: <8% red, 8–15% amber, >15% green (cold)
- Contact Rate: <40% red, 40–50% amber, >50% green, >60% elite
- Unique Dial Rate: <20% red (over-dialing), 30–50% green, >70% red (under-following-up)
- Short-hangup rate per rep: >1.5× team avg = ⚠

### Out of scope
- Compliance overlays (TCPA/state restrictions/STIR-SHAKEN) — user said outbound, not cold
- Number health / spam flagging — Dialpad-side concern
- Cadence editor — read-only diagnostic only
- Agent productivity ratios (Preview/ACW/Idle) — Dialpad doesn't expose these to us

### Files touched
- `src/lib/reportMetrics.ts` (extend)
- `src/lib/hourlyMetrics.ts` (extend)
- `src/components/reports/HourlyBreakdownTable.tsx` (add connections col)
- `src/components/reports/OutboundDiagnosticPanel.tsx` (new)
- `src/pages/ReportsPage.tsx` (new tab)

