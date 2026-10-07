
- Productive dialling hours = (dials × 25 seconds) + connected talk time (dialpad_calls.talk_time_seconds) + (bookings × 5 minutes), computed in lib/dialpadHours.ts; the 15-min-gap span measure is only the fallback for reps with no Dialpad calls.
- Call stage flags on call_scores are derived by trigger from NEPQ scores (>=3 = reached); call_reviews stage values override them.

- Meeting-to-GHL link lives in pipeline_items.meeting_ghl_opportunity_id / meeting_ghl_stage_id (mapped to ghl_* on read); stage map in src/lib/ghlMeetingSync.ts — the ghl_* names are stripped from writes by design.

- The dashboard's personal call funnel reuses the Insights KPI strip and funnel chart, filtering call logs and booking metrics to the signed-in rep so both views share definitions.
- Fathom is connected per closer: each user's API key lives in fathom_connections (key column not granted to browser roles) and only the `fathom` edge function reads it — keys are personal to each Fathom account.
