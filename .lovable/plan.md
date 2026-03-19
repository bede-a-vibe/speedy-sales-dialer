

# Auto-Disable DND Before Dialing

## Problem

When a Dialpad user has Do Not Disturb (DND) enabled, the `initiate_call` endpoint fails to place outbound calls. Reps use DND intentionally to block inbound callbacks, but this also blocks the dialer from making outbound calls.

## Solution

Automatically disable DND via the Dialpad API before placing each call, then re-enable it immediately after the call is initiated. This gives the dialer a brief window to place the outbound call while keeping DND active for the rest of the time.

The Dialpad API provides `POST /users/{id}/togglednd` to flip DND on/off.

## Flow

```text
1. Preflight check → detect DND is ON
2. POST /users/{id}/togglednd → DND OFF
3. POST /users/{id}/initiate_call → place call
4. POST /users/{id}/togglednd → DND back ON
```

If the call initiation fails, DND is still restored. If the user wasn't in DND, steps 2 and 4 are skipped entirely.

## Changes

### Edge Function (`supabase/functions/dialpad/index.ts`)

In the `initiate_call` action, before calling the `initiate_call` endpoint:

1. Check user DND status via `GET /users/{id}` (already implemented in `check_user_status`)
2. If `do_not_disturb === true`, call `POST /users/{id}/togglednd` to disable it
3. Place the call as normal
4. If DND was disabled in step 2, call `POST /users/{id}/togglednd` again to re-enable it (in a `finally` block so it always runs)

This is entirely server-side — no frontend changes needed.

### Frontend (`src/hooks/useDialerDialpad.ts`)

No changes required. The preflight `checkDialpadReady` already runs but doesn't block. The DND handling moves entirely to the edge function.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/dialpad/index.ts` | Add DND auto-toggle logic around `initiate_call` — check status, disable DND, place call, re-enable DND |

