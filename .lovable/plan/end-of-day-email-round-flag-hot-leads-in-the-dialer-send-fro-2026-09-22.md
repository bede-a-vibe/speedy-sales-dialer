# End-of-day email round — flag hot leads in the dialer, send from the EOD page

## What you get

A "Send them an email tonight" toggle on the dialer's call-logging panel. Flag a lead, log the call as usual, and an AI draft is written straight away while the conversation is fresh. At knock-off, the End of Day report page shows your email round: every lead flagged today, each with a ready draft, copy buttons, and an "Open in my email" button (pre-fills your email app). Mark each one sent or skip it.

## How it works

1. **Flag in the dialer**
   - New toggle in `LogCallPanel` (same pattern as the existing "mobile reaches a gatekeeper" toggle): "Worth an email tonight".
   - Persists on the contact when the call is logged: new columns `eod_email_flagged_at`, `eod_email_flagged_by` (and `eod_email_sent_at` when done). Only one flag per lead — re-flagging after it's been sent is allowed.
   - Right after logging, an AI draft is generated with the just-logged notes + transcript summary via the existing `generate-email-draft` function and `generateFollowUpEmailDraft`, and stored with the existing draft store (already reused by Contact Detail and Follow-ups pages).

2. **Email round on the EOD report page** (`EodReportPage`)
   - New "Tonight's email round" section above the report form: today's flagged, unsent leads for the signed-in rep.
   - Each lead row: name, business, recipient email (or "no email captured" warning), the draft subject/body in a compact card with copy buttons, and a mailto: button that opens the rep's own email app pre-filled.
   - Actions per lead: "Mark sent" (stamps `eod_email_sent_at`, removes from list) and "Skip" (clears the flag, no email).
   - Counter in the section header (e.g. "3 of 7 sent") so it's obvious when the round is done.

3. **No backend sending** — drafts open in the rep's own email client; nothing is auto-sent, matching the existing "safe preview" approach.

## Technical details

- Migration: `contacts` gains `eod_email_flagged_at timestamptz`, `eod_email_flagged_by uuid`, `eod_email_sent_at timestamptz` (all nullable); types regenerated.
- `LogCallPanel` gets `emailFlag` / `onEmailFlagChange` props (mirrors `mobileGatekeeper`); `DialerPage` wires it into the existing log-call submit path, then fires draft generation fire-and-forget (never blocks the next lead).
- EOD query: `contacts` where `eod_email_flagged_by = auth.uid()`, `eod_email_sent_at is null`, flagged today (Melbourne day boundary, consistent with the app's timezone rules).
- mailto: links use the contact's email with subject/body URL-encoded; clipboard copy as fallback for Outlook users.
- Existing draft store (`emailDraftStore.ts`) means the same drafts also appear on the Contact Detail page.

## Out of scope

- Auto-sending emails, GHL draft notes, admin views of other reps' flags.
