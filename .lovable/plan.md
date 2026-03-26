

## Add Follow-up Types: Call, Email, and Prospecting

Currently all follow-ups are treated the same. This plan adds a `follow_up_method` column so each follow-up (or prospecting item) gets a tag, and the Follow-ups tab gets a filter bar to switch between them.

### Database change

Add a `follow_up_method` column to `pipeline_items`:

```sql
ALTER TABLE public.pipeline_items
  ADD COLUMN follow_up_method text NOT NULL DEFAULT 'call';
```

Valid values: `call`, `email`, `prospecting`. Default `call` so all existing follow-ups remain unchanged.

No new enum type needed — a text column with application-level validation keeps it simple and extensible.

### Frontend changes

1. **Types** (`usePipelineItems.ts`)
   - Add `follow_up_method` (`"call" | "email" | "prospecting"`) to `PipelineItemInsert`, `PipelineItemUpdate`, and `PipelineItemWithRelations`.
   - Include `follow_up_method` in all select queries.

2. **Follow-ups tab filter bar** (`PipelinesPage.tsx`)
   - Add a filter row above the follow-up list with buttons/select: All | Call | Email | Prospecting.
   - Filter the `followUps` array client-side by `follow_up_method`.

3. **Pipeline item card** (`PipelineItemCard.tsx`)
   - Show a small badge/tag on each card: "Call", "Email", or "Prospecting" with distinct colors (e.g. blue/purple/orange).
   - For email follow-ups, hide the "Mark complete" phone-centric language — keep it but relabel contextually.

4. **QuickBookDialog + DialerPage**
   - When creating a follow-up, add a `follow_up_method` selector (radio or small toggle): Call | Email | Prospecting.
   - Default to "call" to preserve current behavior.
   - Pass the selected method through to `useCreatePipelineItem`.

5. **BookedOutcomePanel** follow-up creation
   - When "Schedule follow-up" is checked after an outcome, add the same method selector so the user can choose call/email/prospecting for the auto-created follow-up.

6. **Requeue edge function** (`requeue-follow-ups/index.ts`)
   - Only requeue items where `follow_up_method = 'call'`. Email and prospecting follow-ups should stay in the pipeline until manually completed — they don't go back into the dialer queue.

### Summary of files changed

| File | Change |
|---|---|
| Migration SQL | Add `follow_up_method` column |
| `usePipelineItems.ts` | Add field to types + select queries |
| `PipelinesPage.tsx` | Add filter bar on follow-ups tab |
| `PipelineItemCard.tsx` | Show method badge |
| `QuickBookDialog.tsx` | Add method selector when creating follow-up |
| `DialerPage.tsx` | Add method selector for follow-up outcome |
| `BookedOutcomePanel.tsx` | Add method selector for follow-up after outcome |
| `requeue-follow-ups/index.ts` | Filter to only requeue `call` method |

