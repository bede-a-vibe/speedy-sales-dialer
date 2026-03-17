

## Hang Up Active Call From Dialer (Even Without Call ID)

### Problem
When the system fails to capture a `call_id` from Dialpad, the hangup button disappears. The user is stuck on a live call with no way to end it from the dialer. The "Cancel Active Call" button only renders when `activeDialpadCallId` is set.

### Solution

**1. Add a `force_hangup` backend action** (`supabase/functions/dialpad/index.ts`)
- New action that accepts `dialpad_user_id` + `phone` (no `call_id` required)
- Uses the same `resolve_call` discovery logic to find the active call by user + phone match
- Once found, immediately calls `POST /call/{id}/actions/hangup`
- If no active call found, returns success with `already_ended: true`

**2. Show hangup button during resolving state** (`src/components/dialer/DialpadSyncPanel.tsx`)
- In the `isResolving` branch (line 67-71), add a "Cancel Call" button alongside the "Connecting..." text
- Pass through the same `onCancelCall` handler

**3. Update `cancelActiveCall` to work without a call ID** (`src/pages/DialerPage.tsx`)
- Remove the early return on `!activeDialpadCallId` (line 560)
- When `activeDialpadCallId` is null but a call is resolving/active, invoke `force_hangup` with `dialpad_user_id` + `phone` instead of `hangup_call`
- On success, clear resolving state and call state

**4. Add `useForceHangupCall` hook** (`src/hooks/useDialpad.ts`)
- New mutation that calls `{ action: "force_hangup", dialpad_user_id, phone }`

### Files to edit
- `supabase/functions/dialpad/index.ts` -- add `force_hangup` action
- `src/hooks/useDialpad.ts` -- add `useForceHangupCall` mutation
- `src/pages/DialerPage.tsx` -- update `cancelActiveCall` to use force hangup when no call ID
- `src/components/dialer/DialpadSyncPanel.tsx` -- show hangup button in resolving state

