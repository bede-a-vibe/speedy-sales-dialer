

## Plan: Cold Call Conversation Funnel Tracking (revised)

Manually track where each call falls off in the cold-call flow, plus opener attribution for A/B testing scripts. All captured from the dialer during/after the call.

### The funnel

```text
Stage 1: Pickup / Connection (>15s)   ← MANUAL checkbox (Dialpad timing unreliable)
Stage 2: Problem Awareness            ← manual checkbox
Stage 3: Solution Awareness           ← manual checkbox
Stage 4: Verbal Commitment / Interest ← manual checkbox
Stage 5: Meeting Booked               ← already tracked via outcome
```

Each call gets a `furthest_stage_reached` value (0–5) derived from which boxes the rep ticked. Drop-off = where they stopped.

### Database changes (one migration)

Add columns to `call_logs`:
- `reached_connection` (boolean, default false) — manually ticked when rep had a real >15s conversation
- `reached_problem_awareness` (boolean, default false)
- `reached_solution_awareness` (boolean, default false)
- `reached_commitment` (boolean, default false)
- `opener_used_id` (uuid, nullable) — references `call_openers.id`
- `drop_off_reason` (text, nullable) — `gatekeeper`, `not_interested`, `wrong_time`, `price_objection`, `competitor`, `no_pain`, `other`

New table `call_openers`:
- `id`, `name`, `script` (text), `is_active` (boolean), `created_by`, `created_at`
- RLS: all authenticated can SELECT active ones; admins manage

### Dialer UI (capture during/after the call)

Add a compact **"Conversation Progress"** card to the right-hand outcome column in `DialerPage`:

```text
Opener used:  [ Pain-Led ▾ ]   ← dropdown of active openers

Stages reached (tap as you progress):
  ☐ Connected (>15s real conversation)
  ☐ Problem Awareness
  ☐ Solution Awareness
  ☐ Verbal Commitment

If lost → Drop-off reason: [ Gatekeeper ▾ ]
```

All checkboxes are manual. Cascading: ticking a later stage auto-ticks earlier ones (rep can untick). Saves alongside the call log on outcome submit — zero extra clicks if the rep skips it.

### New Reports tab: "Conversation Funnel"

Added to `ReportsPage` after SOP Diagnostic.

**Funnel visualization** (team + per-rep filter):
```text
Connected (>15s)            312  ████████████████████  100%
  ↓ Problem Awareness       198  ████████████          63%   (-37%)
  ↓ Solution Awareness      124  ████████              40%   (-37%)
  ↓ Verbal Commitment        67  ████                  21%   (-46%)
  ↓ Meeting Booked           41  ██                    13%   (-39%)
```

**Opener leaderboard**:
| Opener | Used | Connect→Problem | Problem→Booking | Overall |
|---|---|---|---|---|
| Pain-Led | 142 | 71% | 28% | 14% |
| Curiosity | 98 | 58% | 19% | 7% |

**Drop-off reasons** breakdown table.

Per-rep view highlights each rep's worst drop-off stage → coaching cue.

### Admin: Opener management

New section on the **Targets** page (admin-only): "Call Openers" — add / edit / disable opener variants.

### Files touched

**New:**
- `supabase/migrations/<ts>_call_funnel_tracking.sql`
- `src/components/dialer/ConversationProgressPanel.tsx`
- `src/components/reports/ConversationFunnelPanel.tsx`
- `src/components/admin/CallOpenersManager.tsx`
- `src/hooks/useCallOpeners.ts`
- `src/lib/funnelMetrics.ts`

**Edited:**
- `src/integrations/supabase/types.ts` (auto-regen)
- `src/hooks/useCallLogs.ts` (extend `useCreateCallLog` payload)
- `src/pages/DialerPage.tsx` (mount panel, pass values into call log insert)
- `src/pages/ReportsPage.tsx` (new tab)
- `src/pages/TargetsPage.tsx` (mount opener manager for admins)

### Out of scope
- Auto-detecting funnel stage from transcripts (future, via Lovable AI)
- Backfilling funnel data on historical call logs
- Per-objection sub-tagging beyond the 7 drop-off reasons

