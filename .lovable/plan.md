

# Fix: 5-second delay between leads in the power dialer

## Root cause

The delay is caused by the **backend `initiate_call` action** in the Dialpad edge function. After placing the call via Dialpad's API, it polls up to 6 times with delays `[0, 150, 250, 400, 600, 900]ms` to discover the `call_id`. The edge function logs confirm this frequently burns the full ~2.3 seconds and still fails to find a call_id ("Could not discover call_id after 6 attempts"). Combined with cold-boot time (~25-30ms) and network round-trip to the edge function, this easily adds up to 3-5 seconds.

The frontend already has a robust resolution polling mechanism (`isCallResolving` + `resolve_call` polling at lines 801-855) that handles the case where no `call_id` is returned. So the server-side polling is redundant -- it delays the response without adding value.

## Fix

### 1. Edge function: Remove server-side call discovery polling

**File**: `supabase/functions/dialpad/index.ts`

Change the `initiate_call` poll delays from `[0, 150, 250, 400, 600, 900]` to `[0]` -- a single instant check. If the call_id isn't immediately available (which is the common case), return instantly with `call_resolved: false` and let the frontend's existing resolution polling handle discovery.

This cuts ~2.3 seconds of server-side waiting per call.

### 2. Frontend: Remove `dialpadCall.isPending` guard from the dial effect

**File**: `src/pages/DialerPage.tsx`

The `useEffect` at line 712 that triggers `attemptDial` checks `dialpadCall.isPending` as a guard condition. When advancing to the next lead, the previous call's mutation may still be marked as pending (React Query hasn't cleared it yet), causing a brief delay before the new dial fires. Remove this guard since the `activeDialRequestRef` + `hasActiveDialRequestLock` already prevent duplicate dials.

## Expected outcome

- Call placement returns from the edge function in <500ms instead of 2-3s
- The next lead's dial fires immediately after state advance
- Call tracking/linking continues to work via the existing frontend resolution polling

