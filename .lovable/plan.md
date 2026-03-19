

# Pipeline Management & Cash Collection Tracking

## What's Missing Today

1. **No deal value / cash collected** — There's no monetary field on pipeline items. You can't track revenue from closed deals.
2. **No visibility into "sitting" appointments** — Booked appointments past their scheduled date with no outcome recorded are invisible. No way to see which ones are stale.
3. **Reschedule count not tracked** — When an appointment is rescheduled, the old outcome is overwritten. You can't see how many times a lead was rescheduled before showing/closing.
4. **Reports lack a dedicated pipeline funnel view** — Show rate, reschedule rate, close rate, and cash collected aren't presented as a clear funnel.

## Plan

### 1. Add `deal_value` and `reschedule_count` columns (Migration)

```sql
ALTER TABLE pipeline_items
  ADD COLUMN deal_value numeric DEFAULT NULL,
  ADD COLUMN reschedule_count integer NOT NULL DEFAULT 0;
```

Update `validate_pipeline_item()` trigger: when outcome = `rescheduled`, increment `reschedule_count` instead of resetting it. This preserves history of how many times each appointment was moved.

### 2. Add cash input to outcome recording UI

In `PipelineItemCard.tsx`, when recording `showed_closed`, show a currency input for deal value. The value gets saved to `pipeline_items.deal_value`.

Update `PipelineItemUpdate` type and mutation to include `deal_value`.

### 3. Add "Stale Appointments" view to Pipelines page

On the Booked tab, surface appointments where `scheduled_for < now()` and `appointment_outcome IS NULL` with a prominent "Needs Outcome" badge. Sort these to the top so managers can see which booked calls are sitting without resolution.

### 4. Add Pipeline Funnel tab to Reports

New "Pipeline Funnel" tab in `ReportsPage.tsx` showing:

```text
┌─────────────────────────────────────────┐
│  Appointments Booked          120       │
│  ├─ Pending (no outcome yet)   15       │
│  ├─ Rescheduled                22  18%  │
│  ├─ No Show                    18  15%  │
│  ├─ Showed                     65  54%  │
│  │   ├─ Verbal Commitment      12  18%  │
│  │   ├─ Closed                 38  58%  │
│  │   └─ No Close               15  23%  │
│  Cash Collected           $47,500       │
│  Avg Deal Value            $1,250       │
└─────────────────────────────────────────┘
```

This uses existing `pipeline_items` data + the new `deal_value` column.

### 5. Add cash metrics to reportMetrics.ts

Extend `AppointmentPerformanceMetrics` with:
- `cashCollected: number` — sum of `deal_value` where outcome = `showed_closed`
- `averageDealValue: number` — `cashCollected / showedClosed`
- `pendingOutcome: number` — appointments past scheduled date with no outcome
- `rescheduleRate: number` — `rescheduled / total`

Extend `RepComparisonRow` so the rep comparison table shows cash collected per rep.

### 6. Update Rep Comparison table

Add "Cash" and "Avg Deal" columns to the rep comparison table in Reports, and "Rescheduled" + "Reschedule %" columns.

## Files Changed

| File | Change |
|------|--------|
| Migration | Add `deal_value`, `reschedule_count` columns; update `validate_pipeline_item` trigger |
| `src/hooks/usePipelineItems.ts` | Add `deal_value`, `reschedule_count` to types and queries |
| `src/components/pipelines/PipelineItemCard.tsx` | Add cash input for closed outcome; show reschedule count badge; stale appointment badge |
| `src/lib/reportMetrics.ts` | Add cash/pending/reschedule metrics to interfaces and calculations |
| `src/lib/appointments.ts` | No changes needed |
| `src/pages/ReportsPage.tsx` | Add Pipeline Funnel tab with funnel visualization and cash metrics; extend rep comparison table |
| `src/pages/PipelinesPage.tsx` | Sort stale appointments to top on Booked tab; show stale count badge |

