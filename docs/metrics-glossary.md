# Metric glossary

Generated from `src/lib/funnelStatsCatalog.ts` (METRIC_FORMULAS). The Definitions button on the Custom Monitor shows the same text. Regenerate with the script in the PR that changes a rule; do not hand-edit.

## The rules

- Setting runs from the dial to the booked meeting resolving. Closing starts when the closer pitches.
- Two commitment rates: Call Commitment Rate (setting) = calls reaching the commitment stage ÷ conversations; Verbal Commitment Rate (closing) = verbals ÷ pitched.
- A booked slot resolves one of four ways: showed, no-show, cancelled, rescheduled. Pending and upcoming slots are not resolved.
- Show-up rate = showed ÷ every slot scheduled for the day that resolved. No-show, cancellation and reschedule rates share that denominator, so the four add to 100%.
- Pitched = a close decision was recorded on the meeting (closed, no close, verbal, no-close follow-up), first or second meeting.
- Close rate = closed ÷ pitched, with meetings marked not qualified excluded. Shown → Close = closed ÷ all showed.
- A qualified verdict is set on the booking. Unjudged means unknown, never not qualified.
- Avg deal value = first collection: one-off fee plus the first retainer month.

# Setting side

## Activity

| Metric | Note | Rule |
|---|---|---|
| Dials |  | Every call attempt logged in the dialer in the period, by date dialled. |
| Unique Leads Dialed |  | Distinct contacts dialled at least once in the period. |
| Avg Attempts / Lead | dials ÷ unique leads | Dials ÷ unique leads dialled. |
| Pick Ups |  | Dials answered by a person: not interested, DNC, follow-up, booked, or a gatekeeper. Voicemail and no answer are not pickups. |
| Pick Up Rate |  | Pick ups ÷ dials. |
| Talk Time |  | Sum of Dialpad talk time across the period's dials (total call duration when talk time is missing). |
| Avg Talk / Dial |  | Talk time ÷ dials. |
| Avg Talk / Pickup |  | Talk time ÷ pick ups. |

## Conversations

| Metric | Note | Rule |
|---|---|---|
| Conversations | reached connection | Dials where the rep tagged that the Connection stage was reached. Counted from the day stage tagging went live. |
| Dial → Pickup |  | Pick ups ÷ dials. |
| Pickup → Conversation | since 23 Apr 2026 | Conversations ÷ pick ups, both counted only from the day stage tagging went live. |
| Call Commitments | reached the commitment stage | Dials where the prospect committed on the call: tagged at the Commitment stage, or booked (a booking counts even if the stage was not ticked). Since stage tagging went live. |
| Call Commitment Rate | commitments / conversations | Call commitments ÷ conversations. The setting-side commitment rate. |
| Immediate Hang-Ups |  | Dials where the connection exit reason is 'hung up immediately'. |
| Short Hangups <15s |  | Pick ups that ended in under 15 seconds. |
| Short Hangups <2m |  | Pick ups that ended in under 2 minutes. |
| Long DQ >30m | long calls ending bad | Calls over 30 minutes that ended not interested, DNC or disqualified. |

## Outcomes

| Metric | Note | Rule |
|---|---|---|
| No Answer |  | Dials logged as no answer. |
| Voicemail |  | Dials logged as voicemail (no message left; next number). |
| Not Interested |  | Dials logged as not interested. |
| DNC |  | Dials logged as do not call. |
| Follow-ups |  | Dials logged as follow-up (call back later). |

## Bookings

| Metric | Note | Rule |
|---|---|---|
| Bookings Made | by date booked | Bookings created in the period, by the date the rep booked them, not the meeting date. Includes cold-call meetings that only exist in the GHL calendar. |
| Same/Next Day Rate | fast bookings | Bookings whose meeting is the same or next day ÷ bookings made. |
| Conversation → Booking | since 23 Apr 2026 | Bookings made ÷ conversations, both since stage tagging went live. |
| Pickup → Booking |  | Bookings made ÷ pick ups. |
| Lead → Booked |  | Bookings made ÷ unique leads dialled. |
| Showed | sittings; a lead that met twice counts twice | Meetings scheduled in the period that showed: closed, no close, verbal, second meeting booked, or no-close follow-up. Counts sittings; a lead that met twice counts twice. |
| Unique Leads Showed | distinct businesses that showed | Distinct businesses with at least one showed meeting in the period. |
| First-Meeting Show-Up Rate | first slot with a lead | Show-up rate on slots where the lead had not showed at an earlier meeting. |
| No-Shows |  | Meetings logged as no-show (ghosted). |
| Cancelled |  | Meetings cancelled or disqualified before they sat, plus bookings cancelled by status. |
| Show-Up Rate | showed / (showed + no-shows + cancelled + rescheduled) | Showed ÷ every slot scheduled for the day that resolved (showed + no-shows + cancelled + rescheduled). Pending and upcoming slots are excluded. |
| No-Show Rate | ghosted / resolved slots | No-shows ÷ resolved slots. With cancellation and reschedule rate, the four buckets add to 100%. |
| Rescheduled | slots that were moved | Slots that were moved to another time (the old slot). |
| Reschedule Rate | moved / resolved slots | Rescheduled ÷ resolved slots. |
| Cancellation Rate | cancelled / resolved slots | Cancelled ÷ resolved slots. |
| Show-Up Rate (never moved) | slots never rescheduled | Show-up rate on slots that were never moved. |
| Rescheduled Slots Resolved | moved at least once, then resolved | Resolved slots that had been moved at least once before they resolved. |
| Show-Up Rate (rescheduled) | slots moved at least once | Show-up rate on slots moved at least once. |
| Show-Up Rate (moved 2+) | slots moved two or more times | Show-up rate on slots moved two or more times. |
| Qualified Bookings | marked qualified | Bookings marked qualified by the setter or closer. |
| Not Qualified | marked not qualified | Bookings marked not qualified. |
| Verdict Coverage | bookings with a verdict | Bookings with a qualified verdict ÷ all bookings. Shows how much of the sample has been judged. |
| Qualified Booking Rate | qualified / all bookings | Bookings marked qualified ÷ all bookings. A booking with no verdict counts as not qualified here, so mark them. |
| Qualified Showed |  | Showed meetings marked qualified. |
| Qualified Show Rate | qualified shows / all shows | Showed meetings marked qualified ÷ all showed meetings. 13 qualified of 26 shows = 50%. Unjudged shows count as not qualified here. |
| Show-Up Rate (qualified) | showed / resolved, qualified bookings only | Show-up rate on bookings marked qualified. |
| Show-Up Rate (not qualified) | showed / resolved, not-qualified bookings only | Show-up rate on bookings marked not qualified. |

# Closing side

## Closing

| Metric | Note | Rule |
|---|---|---|
| Second Meetings | resolved slots after the lead already showed once | Resolved slots where the lead had already showed at an earlier meeting (a second meeting; a reschedule is not). |
| Second-Meeting Show-Up Rate | follow-up slots only | Showed ÷ resolved slots, second meetings only. |
| Closed |  | Meetings logged as showed and closed. |
| Pitched | close or no-close recorded | Meetings where a close decision was recorded: closed, no close, verbal commitment, or no-close follow-up. First or second meeting. 'Second meeting booked' is discovery only and is not a pitch. |
| Close Rate | closed / pitched, not-qualified excluded | Closed ÷ pitched, with meetings marked not qualified removed from the denominator. Unjudged meetings stay in. |
| Shown → Close | closed / all showed | Closed ÷ all showed meetings, qualified or not. 20 showed, 10 qualified, 10 closed = 50% here and 100% close rate. |
| Verbal Commitments |  | Meetings logged as showed with a verbal commitment. |
| Verbal Commitment Rate | verbal / pitched | Verbal commitments ÷ pitched. The closing-side commitment rate. |
| Verbal → Closed | verbal leads that closed | Leads that gave a verbal and then closed ÷ leads that gave a verbal (within the window). |
| Qualified Closed |  | Closed meetings marked qualified. |
| Qualified Lead Close Rate | closed / qualified pitched | Closed ÷ pitched, bookings marked qualified only. |
| Qualified Booking → Close | closed / qualified bookings | Closed ÷ all bookings marked qualified, whether or not they sat. |
| Unqualified Close Rate | closed / not-qualified pitched | Closed ÷ pitched, bookings marked not qualified only. |
| Qualified Verbals |  | Verbal commitments on bookings marked qualified. |
| One-Off Collected | setup / one-off fees on closes | Sum of one-off / setup fees on closed meetings. |
| Retainers Won | monthly retainers on closes | Sum of monthly retainers on closed meetings. |
| First Collection | one-off + first retainer month | First collection: one-off fee plus first retainer month, summed over closed meetings. |
| Avg Deal Value | first collection per close | First collection ÷ closed meetings. A $4k retainer with no setup fee is a $4k deal. |
| Avg Retainer | monthly, per close | Retainers won ÷ closed meetings. |
| Avg One-Off | setup fee, per close | One-off fees ÷ closed meetings. |

