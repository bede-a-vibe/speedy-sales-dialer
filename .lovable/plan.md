

## Dialer Queue Logic — Implemented

### What was done

1. **Database migration**: Added 6 new columns (`next_followup_date`, `last_call_sentiment`, `best_time_to_call`, `budget_indication`, `authority_level`, `meeting_booked_date`) with indexes. Reverted historically stuck "called" contacts back to "uncalled".

2. **Rewrote `claim_dialer_leads`** with:
   - 7 exclusion rules (meeting booked, follow-up date, dead number, not interested, hostile, max 12 attempts, DNC)
   - Outcome-aware cooldown (24h default, 48h for voicemails or 3+ attempts)
   - Priority scoring engine (prospect tier + buying signal + budget + authority + sentiment − fatigue − suspect quality)
   - Time-of-day routing (Morning/Afternoon/After Hours based on AEST)
   - Sort: priority_score DESC, call_attempt_count ASC, random()

3. **Rewrote `get_dialer_queue_count`** with matching logic.

4. **Reverted status fallback** to `"uncalled"` for recyclable outcomes (no_answer, voicemail, not_interested, wrong_number).

5. **Added `meeting_booked_date`** and **`next_followup_date`** writes on booking/follow-up outcomes in DialerPage.

6. **Added `best_time_to_call`** field to DecisionMakerCapture UI (separate from `best_route_to_decision_maker`) with GHL sync.

### Field Mapping Summary

| Spec Field | DB Column | GHL Field Key |
|------------|-----------|---------------|
| Meeting Booked Date | `meeting_booked_date` | `contact.meeting_booked_date` |
| Next Follow-up Date | `next_followup_date` | `contact.next_followup_date` |
| Best Time to Call | `best_time_to_call` | `contact.best_time_to_call` |
| Last Call Sentiment | `last_call_sentiment` | `contact.last_call_sentiment` |
| Budget Indication | `budget_indication` | `contact.budget_indication` |
| Authority Level | `authority_level` | `contact.authority_level` |
| Best Route to DM | `best_route_to_decision_maker` | `contact.best_route_to_dm` |
