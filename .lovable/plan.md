

## Problem Analysis

The root cause is a **race condition between `startSession` and `ensureBuffer`** during session initialization.

### What happens:

1. `startSession` sets `sessionRef.current` and calls `setSessionId(activeSessionId)` **before** the initial `claimIntoBuffer` resolves
2. The React prefetch effect (line 438-441) sees `sessionId` is set and `contacts.length === 0`, so it calls `ensureBuffer()` immediately
3. Now **two concurrent `claimDialerLeads` RPCs** hit the database with the same session and same deterministic contact ordering
4. The `ON CONFLICT (contact_id) DO NOTHING` clause means one call gets the contacts, the other gets zero
5. If `startSession`'s call loses the race, it returns `claimedCount = 0` → `startDialing` shows "No more leads" and stops the session
6. But `ensureBuffer` already claimed contacts and set them in state — and the Dialpad call effect fires because contacts briefly exist

Evidence from network logs: Two `claim_dialer_leads` requests at the exact same timestamp (22:03:20). First returned `{"claimed_contacts": [], "total_available_count": 51889}`. Second returned 12+ contacts.

### Fix (3 changes in `src/hooks/useContacts.ts`)

**1. Delay `setSessionId` until after initial claim succeeds**

Move `setSessionId(activeSessionId)` from before `claimIntoBuffer` to after it resolves. This prevents the prefetch effect from triggering `ensureBuffer` during the initial claim. The `sessionRef.current` assignment stays early (needed by `claimIntoBuffer` internally).

**2. Add retry on empty claim when leads exist**

In `claimIntoBuffer`, when `newlyClaimed.length === 0` but `total_available_count > 0` and it's the first iteration, wait 300ms and retry once. This handles transient lock contention gracefully.

**3. Guard `ensureBuffer` during startup**

Add a `startingRef` flag that `ensureBuffer` checks, preventing it from running while `startSession` is doing its initial claim.

### Expected outcome

- The initial claim won't race with `ensureBuffer`, eliminating the contention
- If lock contention still happens (e.g., from another user), the retry handles it
- The Dialpad call effect only fires once the session is fully established with contacts

