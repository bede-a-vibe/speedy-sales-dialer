

## Plan: Implement Dialer Queue Logic from Specification

### Current State

The dialer queue (`claim_dialer_leads`) currently uses a simple model:
- Filter: `status = 'uncalled' AND is_dnc IS NOT TRUE`
- Sort: `call_attempt_count ASC, random()`
- No cooldown, no priority scoring, no exclusion beyond DNC/status

The spec introduces significant new logic: exclusion rules, disposition-based cadence, and a priority scoring engine. Several required columns don't exist yet in the `contacts` table.

### Gap Analysis

**Missing columns** (needed for the spec's exclusion/routing/scoring):

| Column | Purpose | GHL Field |
|--------|---------|-----------|
| `next_followup_date` | Follow-up scheduling exclusion | `contact.next_followup_date` |
| `last_call_sentiment` | Hostile exclusion + scoring | `contact.last_call_sentiment` |
| `best_time_to_call` | Time-window routing | `contact.best_time_to_call` |
| `budget_indication` | Priority scoring | `contact.budget_indication` |
| `authority_level` | Priority scoring | `contact.authority_level` |
| `meeting_booked_date` | Meeting booked exclusion | `contact.meeting_booked_date` |

**Columns that already exist** and map to spec fields:
- `call_attempt_count` → `total_call_attempts`
- `phone_number_quality` → `number_quality` (values need alignment: spec uses "Red - Dead/Wrong")
- `buying_signal_strength` → `buying_signal_strength` (spec uses "None - Not Interested")
- `prospect_tier` → `prospect_tier` (values need alignment)
- `last_called_at` → cooldown timing
- `best_route_to_decision_maker` → gatekeeper routing
- `latest_appointment_scheduled_for` → partial meeting booked detection
- `voicemail_count` → voicemail cadence

**Status model change**: Currently `status` is the only queue gate (`uncalled`). The spec wants recyclable leads to stay as `uncalled` with cooldown-based exclusion — which aligns with reverting the recent "called" fix and adding cooldown instead.

### Changes

#### 1. Database migration — add missing columns + revert status

```sql
-- Add missing columns for spec
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS next_followup_date timestamptz;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS last_call_sentiment text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS best_time_to_call text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS budget_indication text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS authority_level text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS meeting_booked_date timestamptz;

-- Indexes for queue performance
CREATE INDEX IF NOT EXISTS idx_contacts_next_followup_date ON public.contacts(next_followup_date);
CREATE INDEX IF NOT EXISTS idx_contacts_last_called_at ON public.contacts(last_called_at);
CREATE INDEX IF NOT EXISTS idx_contacts_meeting_booked_date ON public.contacts(meeting_booked_date);

-- Fix the 2,851 historically stuck contacts: revert to uncalled so they re-enter the queue
UPDATE public.contacts
SET status = 'uncalled', updated_at = now()
WHERE status = 'called' AND call_attempt_count > 0;
```

#### 2. Rewrite `claim_dialer_leads` with spec logic

Replace the current function with one that implements:

**Exclusion filters** (contacts removed from queue):
- `meeting_booked_date IS NOT NULL` → exclude permanently
- `next_followup_date IS NOT NULL AND next_followup_date > now()` → exclude until date
- `phone_number_quality = 'dead'` → exclude permanently
- `buying_signal_strength = 'None'` → exclude (nurture)
- `last_call_sentiment = 'Hostile'` → exclude permanently
- `call_attempt_count > 12` → exclude (max attempts)
- `is_dnc = true` → exclude

**Cooldown logic** (cadence from spec):
- No Answer: 24h for first 3 attempts, then 48h
- Voicemail: 48h minimum (no same-day)
- Not Interested with recyclable status: handled by exclusion above

Simplified to a single cooldown calculation:
```sql
CASE
  WHEN c.last_outcome = 'voicemail' THEN interval '48 hours'
  WHEN c.call_attempt_count >= 3 THEN interval '48 hours'
  ELSE interval '24 hours'
END
```

**Priority scoring** (ORDER BY instead of random):
```sql
-- Base score from prospect_tier
CASE c.prospect_tier
  WHEN 'Tier 1 - Hot' THEN 100
  WHEN 'Tier 2 - Warm' THEN 50
  WHEN 'Tier 3 - Nurture' THEN 20
  WHEN 'Tier 4 - Long Shot' THEN 10
  ELSE 30
END
-- + modifiers from buying_signal, budget, authority, sentiment, fatigue, quality
+ CASE c.buying_signal_strength WHEN 'Strong' THEN 30 WHEN 'Moderate' THEN 15 ELSE 0 END
+ CASE c.budget_indication WHEN 'Has Budget' THEN 20 ELSE 0 END
+ CASE c.authority_level WHEN 'Decision Maker' THEN 15 ELSE 0 END
+ CASE c.last_call_sentiment WHEN 'Warm' THEN 10 WHEN 'Engaged' THEN 10 ELSE 0 END
- CASE WHEN c.call_attempt_count > 6 THEN 15 ELSE 0 END
- CASE c.phone_number_quality WHEN 'suspect' THEN 10 ELSE 0 END
```

**Time-of-day routing**: Filter by `best_time_to_call` against current hour (mapped to time blocks like "Morning", "Afternoon", "After Hours").

**Sort**: `priority_score DESC, call_attempt_count ASC, random()`

#### 3. Update `get_dialer_queue_count` to match

Same exclusion filters and cooldown logic, just counting instead of claiming.

#### 4. Revert status fallback in DialerPage.tsx

Change line 457 back:
```typescript
status: ["dnc", "follow_up", "booked"].includes(outcomeToLog) ? outcomeToLog : "uncalled",
```

Recyclable outcomes (`no_answer`, `voicemail`, `not_interested`) keep `status = 'uncalled'` so they stay in the queue. The SQL cooldown prevents immediate re-dialing.

#### 5. Set `meeting_booked_date` on booking outcome

In `DialerPage.tsx`, when `outcomeToLog === "booked"`, add `meeting_booked_date: new Date().toISOString()` to the contact update.

#### 6. Set `next_followup_date` on follow-up outcome

When `outcomeToLog === "follow_up"` and `scheduledFor` exists, add `next_followup_date: scheduledFor` to the contact update. The queue will exclude this contact until that date.

#### 7. Update `useContacts.ts` — no cooldown param needed

The cooldown is now baked into the SQL function itself (outcome-aware), so no client-side parameter needed.

#### 8. Add new GHL field IDs to the field map

Add the new columns to the GHL push mapping in `ghl/index.ts` and `dialpad/index.ts` so AI summaries can populate `last_call_sentiment`, `budget_indication`, `authority_level`.

#### 9. Update `DecisionMakerCapture` or add UI for new fields

The `best_time_to_call` field (time-window routing) should be capturable during calls. Add it back as a separate field from `best_route_to_decision_maker` (they're different: one is "when to call", the other is "how to reach DM").

### What this achieves

| Current | After |
|---------|-------|
| Simple FIFO by attempt count | Priority scoring engine (prospect tier + signals) |
| No cooldown — leads recycled immediately | Outcome-aware cooldown (24h/48h) |
| Only DNC excluded | 7 exclusion rules (meeting, follow-up date, dead number, not interested, hostile, max attempts, DNC) |
| No time-of-day routing | Respects best_time_to_call windows |
| Queue count never decreases | Queue count reflects genuinely available leads |
| Status = "called" removes from queue forever | Status stays "uncalled", cooldown manages pacing |

### Risk notes

- The priority scoring runs per-claim (25 leads at a time), so performance is fine
- `best_time_to_call` time-block filtering depends on a timezone assumption — will use AEST as default since all contacts are Australian
- The 12-attempt max is a reasonable default; can be made configurable via `performance_targets` later

