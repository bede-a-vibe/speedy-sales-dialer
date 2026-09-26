
- Productive hours come from dialpad_calls spans (lib/dialpadHours.ts), falling back to call_logs gaps only when a rep has no Dialpad calls — Dialpad is the call-time source of truth.
- Call stage flags on call_scores are derived by trigger from NEPQ scores (>=3 = reached); call_reviews stage values override them.
