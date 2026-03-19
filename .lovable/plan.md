# Auto-Disable DND Before Dialing

## Status: Implemented

## Changes Made

### Edge Function (`supabase/functions/dialpad/index.ts`)

In the `initiate_call` action:

1. **DND preflight check**: Before placing the call, fetches `GET /users/{id}` to check `do_not_disturb` status
2. **Auto-disable DND**: If DND is active, calls `POST /users/{id}/togglednd` to temporarily disable it with a 300ms propagation delay
3. **Place call**: Initiates the outbound call as normal
4. **Restore DND in `finally` block**: If DND was disabled, re-enables it via `POST /users/{id}/togglednd` — always runs even if the call fails

### Frontend

No changes required — DND handling is entirely server-side.

## Impact

| Scenario | Before | After |
|----------|--------|-------|
| Rep in DND tries to dial | Call fails | Call succeeds, DND restored after |
| Rep not in DND | Normal | No change (DND toggle skipped) |
| Call initiation fails | DND stays off (manual) | DND auto-restored via `finally` |
