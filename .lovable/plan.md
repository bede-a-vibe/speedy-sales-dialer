
## Plan: Split `useGHLSync.ts` into focused hooks

### Current state
`src/hooks/useGHLSync.ts` is ~540 lines exposing 7 actions: `pushCallNote`, `pushBooking`, `pushFollowUp`, `pushFollowUpEmailDraft`, `pushDNC`, `refreshOpportunityMirror`, `updateOpportunityStage`. Consumed by `DialerPage.tsx`, `QuickBookDialog.tsx`, and `PipelinesPage.tsx`.

### Target structure

```text
src/hooks/ghl/
├── ghlSyncShared.ts          (private helpers: persistOpportunityIdentity, persistContactMirror, reportSyncFailure)
├── useGHLBookingSync.ts      (pushBooking)
├── useGHLFollowUpSync.ts     (pushFollowUp, pushFollowUpEmailDraft)
├── useGHLOpportunityMirror.ts (refreshOpportunityMirror, updateOpportunityStage)
└── useGHLContactSync.ts      (pushCallNote, pushDNC)
```

Then keep `src/hooks/useGHLSync.ts` as a thin **compatibility barrel** that composes all four hooks and returns the same combined shape — so existing callers keep working with zero changes.

### Files

**New**
- `src/hooks/ghl/ghlSyncShared.ts` — extract `describeError`, `reportSyncFailure`, `persistOpportunityIdentity`, `persistContactMirror`, plus shared param types (`PushBookingParams`, etc.)
- `src/hooks/ghl/useGHLBookingSync.ts` — `pushBooking`
- `src/hooks/ghl/useGHLFollowUpSync.ts` — `pushFollowUp` + `pushFollowUpEmailDraft`
- `src/hooks/ghl/useGHLOpportunityMirror.ts` — `refreshOpportunityMirror` + `updateOpportunityStage`
- `src/hooks/ghl/useGHLContactSync.ts` — `pushCallNote` + `pushDNC`

**Modified**
- `src/hooks/useGHLSync.ts` — reduced to a small barrel that calls the 4 hooks and returns `{ pushCallNote, pushBooking, pushFollowUp, pushFollowUpEmailDraft, pushDNC, refreshOpportunityMirror, updateOpportunityStage }`

### Why a compatibility barrel?
Three pages already destructure from `useGHLSync()`. Keeping the barrel means zero touch to `DialerPage.tsx`, `QuickBookDialog.tsx`, and `PipelinesPage.tsx` — the refactor stays pure (no behaviour change, no risk of breaking the dialer flow we just stabilised). Future code can import the focused hooks directly.

### Out of scope
- No behaviour changes
- No GHL API changes
- No edits to consuming pages
