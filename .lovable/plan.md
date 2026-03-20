

## Follow-Up Auto-Requeueing Plan

**Goal**: When a follow-up's scheduled time arrives, automatically transition the contact back into the dialer queue with the follow-up notes visible, so the rep gets prompted to call them.

### How it works today
- Follow-ups create a `pipeline_items` record with `pipeline_type = 'follow_up'` and set the contact status to `follow_up`
- The dialer queue only claims contacts with `status = 'uncalled'`, so follow-ups are excluded
- Follow-ups sit on the Pipelines page until manually actioned

### Approach

**1. Database: Scheduled job to requeue due follow-ups**

Create a `pg_cron` job (runs every 5 minutes) that:
- Finds open follow-up pipeline items where `scheduled_for <= now()`
- Updates the contact's `status` back to `'uncalled'` so it re-enters the dialer queue
- Marks the pipeline item as `status = 'completed'` with `completed_at = now()`
- This means the lead automatically appears in the next dialer session claim

Use the insert tool (not migration) to schedule this via `cron.schedule`.

**2. Database migration: Add `follow_up_note` column to contacts**

Add a `follow_up_note text` column to the `contacts` table. The cron job copies the pipeline item's `notes` into this field when requeueing, so the dialer can display it.

**3. Update `claim_dialer_leads` function** (migration)

No changes needed — it already selects all contact columns. The new `follow_up_note` column will automatically be included.

**4. Frontend: Show follow-up note in dialer**

Update `ContactCard.tsx` to display the `follow_up_note` field when present, with a distinct visual callout (e.g., a yellow/amber banner) so the rep knows this is a follow-up callback and can see the context.

**5. Frontend: Show follow-up note on Contacts page**

Display the follow-up note in the contact row/detail so it's visible during manual browsing too.

**6. Clear follow-up note after call**

When a call outcome is logged in the dialer (`logAndNext`), clear the `follow_up_note` on the contact so it doesn't persist after the follow-up call is made.

### Summary of changes
- **1 migration**: Add `follow_up_note` column to `contacts`
- **1 cron job** (insert tool): Requeue due follow-ups every 5 minutes
- **Edit `ContactCard.tsx`**: Show follow-up note banner
- **Edit `DialerPage.tsx`**: Clear follow-up note after outcome logged
- **Edit `ContactsPage.tsx`**: Show follow-up note if present

