

## Plan: Manual transcript upload on the contact page

Add a way to paste (or upload a `.txt` file) of a Dialpad transcript directly onto a contact, then have the system run the same downstream pipeline as the webhook would: store the transcript, generate the AI summary, save the training/coaching note, and push the summary + AI fields back to GHL.

This is a stopgap so reps and you can keep the data flowing while the Dialpad webhook is still misbehaving. It does not change the webhook path — when that comes back, both routes will produce identical records.

### Where it lives

On the **Contact Detail page** (`/contacts/:id`), a new card titled **"Manual Transcript Upload"** placed just below the existing call history card.

```text
┌─ Manual Transcript Upload ───────────────────────┐
│ Use this when the Dialpad webhook didn't sync.   │
│                                                  │
│ Link to call (optional): [Most recent call ▾]    │
│   • 24 Apr, 2:14pm — Voicemail (2m 14s)          │
│   • 24 Apr, 11:02am — No answer                  │
│   • Don't link, just save transcript             │
│                                                  │
│ Call duration (sec): [____]   Call date: [____]  │
│                                                  │
│ Transcript:                                      │
│ ┌──────────────────────────────────────────────┐ │
│ │ Paste transcript here, or drop a .txt file…  │ │
│ │                                              │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ [ ] Generate AI summary    [ ] Push to GHL       │
│                                                  │
│           [ Cancel ]   [ Save & Process ]        │
└──────────────────────────────────────────────────┘
```

### What happens when the rep clicks "Save & Process"

1. Save the raw transcript as a `contact_notes` row with `source = 'dialpad_transcript'` (same as the webhook does).
2. If a call log was selected from the dropdown, also write the transcript onto `call_logs.dialpad_transcript` and set `transcript_synced_at` so it shows up in the rest of the app's reporting.
3. If "Generate AI summary" is checked: call the existing summary path used by the Dialpad function (Lovable AI Gateway, same prompt) and save the result as a second `contact_notes` row with `source = 'dialpad_summary'`. The training/coaching extraction (`dialpad_training_objection`) runs in the same step.
4. If "Push to GHL" is checked and the contact has a `ghl_contact_id`: enqueue a `pending_ghl_pushes` row using the same shape the webhook uses. The existing retry processor picks it up within seconds and pushes the AI summary note + AI custom fields to GHL.
5. Toast on success with what was saved + a link to view the new note in the existing notes panel below.

### Behaviour rules

- **Auth**: any authenticated user can upload a transcript for a contact. (DNC contacts are still allowed — we're only adding records, not reactivating.)
- **Duplicate guard**: if a transcript with identical content already exists on the contact within the last 5 minutes, ask "It looks like you already saved this transcript. Save anyway?" before inserting.
- **File upload**: `.txt` only, max 200KB. Bigger transcripts get pasted into the textarea (no upload limit there).
- **No call log selected**: still works — the transcript and summary attach to the contact, just not a specific call. Useful when the call log itself never made it from Dialpad.
- **Validation**: transcript must be at least 50 characters. Duration and date are optional and only used to give the AI summary better context.
- **Failure modes**:
  - Transcript saves first; summary generation failure shows a non-blocking warning ("Transcript saved, but AI summary failed — try again from the new card") with a "Retry summary" button on the just-saved transcript note.
  - GHL push failure is silent to the user (already handled by the retry queue).

### Technical changes

**1. New edge function `supabase/functions/manual-transcript-ingest/index.ts`**
- Validates JWT, accepts `{ contactId, callLogId?, transcript, callDate?, durationSeconds?, generateSummary, pushToGhl }`
- Reuses the same helpers that already exist inside `supabase/functions/dialpad/index.ts` (`generateAiSummary`, `upsertContactNote`, the GHL field/note push). Since edge functions can't import across function folders, we'll **extract those three helpers into a shared file** `supabase/functions/_shared/dialpad-pipeline.ts` and have both `dialpad/index.ts` and the new `manual-transcript-ingest/index.ts` import from there. (`_shared` is allowed inside `supabase/functions/`.)
- Returns `{ noteIds: { transcriptNoteId, summaryNoteId? }, callLogUpdated, ghlEnqueued }`

**2. New component `src/components/contacts/ManualTranscriptUpload.tsx`**
- Card UI as drawn above
- Uses `useContactCallLogs(contactId)` to populate the call log dropdown (already exists)
- File drop via `<input type="file" accept=".txt">` + paste textarea
- Calls the new edge function via `supabase.functions.invoke("manual-transcript-ingest", { body: ... })`
- On success: invalidates `["contact-notes", contactId]` and `["contact-call-logs", contactId]` so the existing panels refresh

**3. Edited `src/pages/ContactDetailPage.tsx`**
- Renders `<ManualTranscriptUpload contact={contact} />` between the call history card and the notes card

**4. (Optional, behind the same card) "Re-process this transcript"**
- For any existing `contact_notes` row with `source = 'dialpad_transcript'` that has no matching `dialpad_summary` sibling, show a small "Generate AI summary" button next to it in the existing notes list. Clicking calls the same edge function with `{ transcript: existingNote.content, generateSummary: true, pushToGhl: true }` and skips the transcript-save step. Lets you backfill summaries for transcripts the webhook delivered but the AI step failed on.

### Out of scope

- Bulk-uploading a folder of transcripts (one-at-a-time only for now)
- Parsing transcript files in formats other than plain text (no PDF, DOCX, JSON)
- Auto-matching a pasted transcript to a specific call log by content/timestamp (rep picks from the dropdown)
- Replaying past failed Dialpad webhook deliveries (separate problem; this gives a manual escape hatch in the meantime)
- Fixing the underlying Dialpad webhook — that's tracked separately in `mem://integrations/dialpad-webhook-setup`

