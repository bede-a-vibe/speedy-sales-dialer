# Two-way meeting pipeline: dialer and GHL match

## Goal
The dialer is where meeting results get logged (fast, with reasons). Every result moves the matching GHL opportunity to the right stage, so GHL and the dialer always show the same thing. No-shows, cancellations and reschedules are tracked separately, with rates broken down by lead source.

## What changes for you

**1. Cancellations are their own result**
- New "Cancelled" button next to No-show and Rescheduled when logging a meeting.
- Each needs a reason (so you learn *why*):
  - No-show: forgot, ghosted, emergency/job came up, wrong number/time, other
  - Cancelled: no longer interested, went with someone else, timing, price, other
  - Rescheduled: prospect asked, we asked, clash — plus the new date (creates the new booking, keeps the link to the original)
- No-close and DQ reasons stay as they are.

**2. Every result moves the deal in GHL**
Each dialer result maps to one stage in GHL's Sales Pipeline, and sets won/lost/open:

```text
Booked               -> Contacted (booked)      open
Showed, verbal       -> Proposal / follow-up    open
Closed               -> Won                     won
No close + reason    -> Lost / nurture          lost (reason written to GHL)
No close, follow up  -> Follow-up stage         open
No-show              -> No-show stage           open + follow-up task
Cancelled            -> Cancelled stage         lost (reason written to GHL)
Rescheduled          -> stays booked, new date  open
DQ                   -> Disqualified            lost (reason written to GHL)
```
The reason, closer and recording links are also added as a note on the GHL contact.
The exact GHL stage names get read from your GHL account first; any stage that doesn't exist (e.g. "No-show", "Cancelled") I'll list so you can add it in GHL, or we map to the closest one.

**3. Link the 13 older bookings**
A one-off run finds or creates their GHL opportunity and puts each on the correct stage for its current result.

**4. Changes made in GHL come back**
If someone moves a deal in GHL, the dialer picks it up on the regular sync so the two don't drift. The dialer wins if both change at once (it holds the reason).

**5. New tracking on the Close tracking tab**
- Show rate, no-show rate, cancellation rate, reschedule rate — each as its own figure (all divided by meetings that were due).
- Close rate stays closed / (shows - DQs).
- Reason breakdowns for no-shows, cancellations and reschedules alongside the existing no-close and DQ charts.
- **By source** table: for each lead source (cold call, Meta ads, referral, etc.) — booked, show %, cancel %, reschedule %, close %, revenue.
- Filters: closer, setter, source, period.

## Technical details
- DB: add `cancelled` to `appointment_outcome`; `pipeline_items` gains `rescheduled_from_id`, `ghl_stage_synced_at`, `ghl_sync_error`. Reason lists extended in `src/lib/appointments.ts`; `sync_pipeline_outcome_to_contact` + `set_pipeline_close_fields` handle `cancelled`.
- New `APPOINTMENT_OUTCOME_TO_GHL_STAGE` in `src/shared/ghlPipelineContract.ts` (stage ids resolved once from GHL pipelines API, cached); replaces the current follow_up/not_interested approximation in `pipelineMappings.ts`.
- `handleBookedOutcome` pushes opportunity stage + status + lostReason and a note via the existing ghl edge function, queued through `pending_ghl_pushes` for retries.
- Backfill action in the ghl function for unlinked booked items (match by contact's `ghl_contact_id`, else create).
- Inbound: existing GHL sync compares opportunity stage to the mapped outcome and updates `pipeline_items` only when the dialer hasn't changed it since last push.
- Source = contact's normalised lead channel (`normalise_lead_channel`), with ad-sourced deals from `client_deals`.
- Verify end-to-end: log each result on a test meeting, confirm the GHL opportunity stage via API and the Close tracking figures.
