

# Strengthen Dialpad–Dialer Connection

## Current Bottlenecks

1. **Double-hop polling for call discovery**: `initiate_call` does only 1 backend attempt to find the call_id, then the frontend makes up to 20 separate edge function calls (each calling Dialpad's `/call` API) to resolve it. That's ~20 round-trips through the edge function.

2. **Status polling via edge function**: After linking, the frontend polls `get_call_status` every 2–6 seconds, each time going client → edge function → Dialpad API → back. This is slow and rate-limit-prone.

3. **Webhook state not leveraged on the client**: The webhook already updates `dialpad_calls` with state/sync info, but the frontend ignores it and polls the Dialpad API directly instead.

## Changes

### 1. Aggressive server-side call discovery (edge function)

Move retry logic from the frontend into `initiate_call` on the backend. Instead of 1 instant check, do 4–5 retries with short delays (0, 200, 400, 600, 800ms) server-side. This resolves most calls in a single edge function round-trip, eliminating 10–20 subsequent `resolve_call` invocations.

**File**: `supabase/functions/dialpad/index.ts` — expand `pollDelays` in `initiate_call` from `[0]` to `[0, 200, 400, 600, 800]`.

### 2. Realtime subscription for call state (frontend)

Subscribe to `dialpad_calls` table changes via Supabase Realtime instead of polling `get_call_status`. The webhook already writes state updates to this table. When a webhook fires (hangup, transcript, summary), the frontend gets notified instantly without any polling.

- Enable Realtime on `dialpad_calls` table (migration)
- Add a Realtime subscription in `useDialerDialpad` that listens for changes to the active `dialpad_call_id`
- Keep the existing status polling as a fallback but reduce frequency to every 15s (safety net only)

**Files**: migration (enable realtime), `src/hooks/useDialerDialpad.ts`

### 3. Reduce frontend resolution polling

Since server-side discovery now handles most cases, reduce `MAX_ATTEMPTS` from 20 to 8 and widen the poll delays (start at 500ms instead of 150ms). The server already tried the fast path.

**File**: `src/hooks/useDialerDialpad.ts`

### 4. Write call state to `dialpad_calls` from webhook

The webhook already writes to `dialpad_calls`, but doesn't store the call `state` field. Add a `call_state` column so the Realtime subscription can read terminal states directly.

**Files**: migration (add `call_state` column), `supabase/functions/dialpad/index.ts` (write state on webhook + on `initiate_call` discovery)

## Summary of Impact

| Metric | Before | After |
|--------|--------|-------|
| Edge function calls per dial | 10–25 | 1–3 |
| Call link latency | 3–15s | 0.5–2s |
| Status polling frequency | 2–6s via API | Realtime push + 15s fallback |
| Rate limit risk | High | Low |

## Files Changed

| File | Change |
|------|--------|
| Migration | Add `call_state` column to `dialpad_calls`; enable Realtime on `dialpad_calls` |
| `supabase/functions/dialpad/index.ts` | Expand `initiate_call` server-side discovery retries; write `call_state` on webhook sync and call discovery |
| `src/hooks/useDialerDialpad.ts` | Add Realtime subscription for `dialpad_calls`; reduce resolution polling to 8 attempts with wider delays; reduce status polling to 15s fallback |

