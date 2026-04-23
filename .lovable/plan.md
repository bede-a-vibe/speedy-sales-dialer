

## Plan: NEPQ-Aligned Stage Exit Reasons

Extend conversation funnel tracking so reps tag *why* the call ended at each stage, using NEPQ-aligned reasons. This replaces the single `drop_off_reason` field with stage-specific exit reasons for sharper coaching.

### NEPQ-aligned exit reasons per stage

**Stage 1 — Connection (>15s) failed:**
- `hung_up_immediately` — Hung up before opener finished
- `gatekeeper_block` — Gatekeeper refused transfer
- `not_right_person` — Wrong contact / DM unavailable
- `wrong_number` — Number invalid / wrong business
- `aggressive_rejection` — Hostile / "take me off your list"

**Stage 2 — Problem Awareness failed (NEPQ Connecting/Situation):**
- `no_pain_acknowledged` — Prospect denies any problem exists
- `status_quo_bias` — "Everything's fine as it is"
- `deflected_questions` — Wouldn't engage with situation questions
- `time_objection_early` — "Not a good time" before pain surfaced
- `defensive_posture` — Got guarded when probed

**Stage 3 — Solution Awareness failed (NEPQ Problem Awareness):**
- `pain_not_big_enough` — Acknowledged issue but low urgency
- `already_solving_it` — Has internal/other solution in motion
- `cant_see_consequence` — Doesn't connect pain to business impact
- `budget_concern_surfaced` — Raised cost too early
- `lost_emotional_engagement` — Went cold mid-conversation

**Stage 4 — Verbal Commitment failed (NEPQ Solution Awareness):**
- `skepticism_of_solution` — Doesn't believe we can help
- `competitor_loyalty` — Locked in with competitor
- `needs_to_think` — "Let me think about it"
- `consult_partner` — Needs to talk to spouse/partner/team
- `price_objection` — Cost is the blocker

**Stage 5 — Booking failed (NEPQ Commitment):**
- `calendar_conflict` — Couldn't find suitable time
- `wants_info_first` — "Send me something to review"
- `cold_feet` — Pulled back at the ask
- `reschedule_loop` — Asked to call back later (vague)
- `decision_maker_absent` — Needs DM present for booking

Plus a universal `other` with optional free-text note.

### Database changes

Replace single `drop_off_reason` column on `call_logs` with stage-specific columns:
- `exit_reason_connection` (text, nullable)
- `exit_reason_problem` (text, nullable)
- `exit_reason_solution` (text, nullable)
- `exit_reason_commitment` (text, nullable)
- `exit_reason_booking` (text, nullable)
- `exit_reason_notes` (text, nullable) — optional free-text for "other" or color

Keep `drop_off_reason` as a generated column (or migrate existing values into the right stage column based on reach flags) for backwards compatibility with the current Reports panel during transition. Then drop it once Reports is updated.

### Dialer UI changes (`ConversationProgressPanel.tsx`)

Replace single drop-off dropdown with a **single contextual exit-reason picker** that switches its options based on the *furthest* stage the rep ticked. This keeps the panel compact:

```text
Stages reached:
  ☑ Connected
  ☑ Problem Awareness
  ☐ Solution Awareness
  ☐ Verbal Commitment

Why did the call end here?
  [ Pain not big enough ▾ ]      ← options for Stage 3 exit
  [ Optional notes... ]
```

Logic:
- Furthest stage reached = N → exit happened at stage N+1 → show Stage N+1's reason set
- If stage 4 reached but no booking → show Stage 5 reasons
- If stage 5 reached (booked outcome) → hide picker entirely
- Switching the stage checkboxes auto-clears the reason if it no longer applies

### Reports changes (`ConversationFunnelPanel.tsx` + `funnelMetrics.ts`)

Replace the single "Drop-off Reasons" table with **per-stage exit-reason breakdowns** — five small tables, one per stage, each showing the top NEPQ exit reasons at that drop point with counts and %.

Add a new **"Top Coaching Cues"** summary card at the top of the funnel tab:
- Auto-surfaces the rep's #1 exit reason at their worst stage
- Per-rep view: "Sarah's biggest leak: Stage 3 — 'Pain not big enough' (42% of her drops here)"

### Files touched

**Edited:**
- `supabase/migrations/<ts>_nepq_stage_exit_reasons.sql` (new migration: add 5 stage columns, optional backfill from `drop_off_reason`, drop old column once Reports is wired)
- `src/lib/funnelMetrics.ts` — replace `DROP_OFF_REASONS` with `STAGE_EXIT_REASONS` map keyed by stage; add `computeStageExitBreakdowns` and `computeTopCoachingCue`
- `src/components/dialer/ConversationProgressPanel.tsx` — contextual stage-aware reason picker + optional notes field
- `src/components/reports/ConversationFunnelPanel.tsx` — five per-stage tables + Top Coaching Cues card
- `src/hooks/useCallLogs.ts` — accept new exit-reason fields in `useCreateCallLog` payload
- `src/pages/DialerPage.tsx` — pass new fields through to call log insert; reset on new call

### Out of scope
- AI auto-classification of exit reasons from transcripts (future)
- Editing reasons on past call logs
- NEPQ scoring/grading of the call itself (separate feature)

