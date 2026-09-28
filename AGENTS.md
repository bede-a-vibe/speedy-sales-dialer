
- Productive dialling hours = (dials × 30 seconds) + connected talk time (dialpad_calls.talk_time_seconds), computed in lib/dialpadHours.ts; the 15-min-gap span measure is only the fallback for reps with no Dialpad calls.
- Call stage flags on call_scores are derived by trigger from NEPQ scores (>=3 = reached); call_reviews stage values override them.
