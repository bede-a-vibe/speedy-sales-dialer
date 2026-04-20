
## Plan: Migrate consumers to focused GHL hooks; delete the barrel

### Changes per file

**`src/pages/DialerPage.tsx`**
- Replace `import { useGHLSync } from "@/hooks/useGHLSync"` with imports of the 4 focused hooks from `@/hooks/ghl/*`.
- Replace `const ghlSync = useGHLSync();` with:
  ```ts
  const { pushCallNote, pushDNC } = useGHLContactSync();
  const { pushBooking } = useGHLBookingSync();
  const { pushFollowUp, pushFollowUpEmailDraft } = useGHLFollowUpSync();
  const { updateOpportunityStage } = useGHLOpportunityMirror();
  ```
- Update all `ghlSync.xxx(...)` call sites (lines ~1033–1108) to bare function names.

**`src/components/QuickBookDialog.tsx`**
- Same swap. Only uses `pushBooking`, `pushFollowUp`, `pushFollowUpEmailDraft`, `updateOpportunityStage` → import 3 focused hooks (booking, followUp, opportunityMirror).
- Update all `ghlSync.xxx(...)` call sites (lines ~520–558).

**`src/pages/PipelinesPage.tsx`**
- Currently destructures `{ pushCallNote, pushFollowUp, refreshOpportunityMirror }`.
- Replace with:
  ```ts
  const { pushCallNote } = useGHLContactSync();
  const { pushFollowUp } = useGHLFollowUpSync();
  const { refreshOpportunityMirror } = useGHLOpportunityMirror();
  ```
- No call-site renames needed (already destructured).

**`src/hooks/useGHLSync.ts`** — delete the barrel file.

### Verification
- Search for any remaining references to `useGHLSync` or `@/hooks/useGHLSync` after the swap; should be zero.
- No behaviour changes; same hook outputs, same params.

### Out of scope
- No changes to the focused hooks themselves or `ghlSyncShared.ts`.
- No GHL API or sync logic changes.
