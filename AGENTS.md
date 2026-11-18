
- Productive dialling hours = (dials × 25 seconds) + connected talk time (dialpad_calls.talk_time_seconds) + (bookings × 5 minutes), computed in lib/dialpadHours.ts; the 15-min-gap span measure is only the fallback for reps with no Dialpad calls.
- Call stage flags on call_scores are derived by trigger from NEPQ scores (>=3 = reached); call_reviews stage values override them.

- Meeting-to-GHL link lives in pipeline_items.meeting_ghl_opportunity_id / meeting_ghl_stage_id (mapped to ghl_* on read); stage map in src/lib/ghlMeetingSync.ts — the ghl_* names are stripped from writes by design.

- The dashboard's My numbers section renders the Insights Setter tracker and Closing tracker locked to the signed-in rep (activeRepId), so both views share definitions; the Tracker tab's funnel and P&L stay admin-only. Reps read their own pay plan, credited first deals (get_setter_first_deals) and credited new clients (get_new_clients) through security-definer functions scoped to auth.uid().
- Fathom is connected per closer: each user's API key lives in fathom_connections (key column not granted to browser roles) and only the `fathom` edge function reads it — keys are personal to each Fathom account.
- Recover stale lazy-page imports through the shared error boundary with a session-guarded document reload; React retries reuse rejected imports and cannot fetch a new deployment manifest.
- The dialer's explicit Pitched checkpoint sits between Solution and Commitment and is retained in call notes; keep it distinct from solution awareness without changing the existing reporting schema.
- EOD dials and pick-ups use logged outcomes matching Insights; manager reports fetch current metrics rather than submission snapshots so corrected calls are reflected, while submitted reflections remain unchanged.
