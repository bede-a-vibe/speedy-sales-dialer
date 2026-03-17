
Yes — this is feasible, and the safest way is to sync Dialpad transcript/summary into both call history and a separate contact-notes timeline.

What I found
- The app can place Dialpad calls now, but it does not store a Dialpad `call_id` against a contact/call log.
- There is no webhook or post-call ingestion path for transcript/summary.
- `call_logs.notes` exists, but there is no dedicated place to accumulate appended contact notes over time.
- Current dialer flow starts a Dialpad call before the rep logs the outcome, so we need a durable call-tracking record to link Dialpad events back to the right contact.

Chosen behavior
- Save transcript/summary to both:
  - the specific call record
  - the contact’s running notes/history
- Append only
- Sync automatically after the call finishes

Plan

1. Add backend tables/fields for post-call sync
- Create a `dialpad_calls` table to track each outbound call:
  - `dialpad_call_id`
  - `contact_id`
  - `user_id`
  - optional `call_log_id`
  - sync status fields
  - timestamps
- Create a `contact_notes` table:
  - `contact_id`
  - `created_by`
  - `source` (`manual`, `dialpad_summary`, `dialpad_transcript`)
  - `content`
  - optional `dialpad_call_id`
  - timestamps
- Extend `call_logs` with transcript-related fields such as:
  - `dialpad_call_id`
  - `dialpad_summary`
  - `dialpad_transcript`
  - `transcript_synced_at`

2. Add secure automatic Dialpad ingestion
- Add a dedicated backend function for Dialpad webhook events.
- Validate webhook authenticity before processing.
- On call completion/transcript-ready events:
  - find the matching `dialpad_calls` row
  - fetch transcript/summary from Dialpad if needed
  - update the matching `call_logs` row
  - append formatted notes into `contact_notes`

3. Update the dialer flow to create the call link early
- When a Dialpad call is initiated from the dialer/manual dial:
  - store the returned Dialpad `call_id` immediately in `dialpad_calls`
  - link it to the current contact and rep
- When the rep clicks “Log & Next”:
  - attach that `call_log` to the existing `dialpad_calls` row
  - also save `dialpad_call_id` on `call_logs`

4. Surface notes in the UI
- Contacts page:
  - add a “Contact Notes” section in the expanded row
  - show appended AI summaries/transcript notes in reverse chronological order
- Dialer page:
  - optionally show the latest synced note for the current contact
- Call history:
  - show summary/transcript availability on each call log entry

5. Keep manual notes working
- Preserve the rep’s typed call notes exactly as today.
- Treat Dialpad summary/transcript as separate appended notes so AI content never overwrites manual notes.

6. Security and access rules
- `dialpad_calls`: authenticated users can see their own or all team calls depending on current app pattern; inserts/updates should be controlled by the authenticated user or backend function.
- `contact_notes`: authenticated read; insert by creator/backend; update/delete limited to creator/admin if editing is allowed.
- Keep roles in `user_roles` only, following the existing pattern.

Recommended note format
```text
Dialpad Summary
- Rep: Jane
- Call time: 17 Mar 2026, 2:30 PM
- Summary: Customer interested in premium package, asked for pricing by email.

Dialpad Transcript
Customer: ...
Rep: ...
```

Implementation order
1. Add schema for `dialpad_calls`, `contact_notes`, and transcript fields on `call_logs`
2. Add RLS policies
3. Update dialer/manual dial flow to persist `dialpad_call_id`
4. Add webhook function for automatic sync
5. Append synced content into `contact_notes`
6. Update Contacts/Dialer UI to display the new notes
7. Add retry/error states for calls where transcript isn’t ready yet

Important caveat
- This depends on your Dialpad account exposing transcript/summary data via webhook/API. If that capability is enabled, this plan works well. If Dialpad only provides the data after a delay, I’d still implement the same structure and add a retry status so nothing is lost.

Files likely affected
- `src/pages/DialerPage.tsx`
- `src/pages/ContactsPage.tsx`
- `src/hooks/useDialpad.ts`
- `src/hooks/useCallLogs.ts`
- new hook for `contact_notes`
- `supabase/functions/dialpad/...` or a new dedicated webhook function
- new database migration(s)

End result
```text
Dialer starts call
  -> save dialpad_call_id + contact link
Rep logs outcome
  -> save call_log and attach to dialpad call
Dialpad finishes processing
  -> webhook receives event
  -> transcript/summary synced
  -> call log updated
  -> contact note appended automatically
```
