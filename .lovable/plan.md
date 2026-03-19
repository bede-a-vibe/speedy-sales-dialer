

# Fix Scaling and Reliability Issues

Based on the architectural assessment, here are the concrete issues to fix now, grouped into manageable steps.

## Issues to Fix

### 1. Missing Row Limits — Silent Data Truncation
`useCallLogsByDateRange` and `useFollowUps` have no `.limit()`, so Supabase silently caps results at 1,000 rows. Reports will show incomplete data once volume grows.

**Fix**: Add batched fetching for `useCallLogsByDateRange` (paginate in 1000-row chunks until exhausted) and add `.limit(2000)` to `useFollowUps` as a safety net.

### 2. Add Database Indexes for Query Performance  
No composite indexes exist on frequently filtered columns. As tables pass 10k+ rows, queries will slow down noticeably.

**Fix** (migration):
```sql
CREATE INDEX IF NOT EXISTS idx_call_logs_user_created ON call_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_contact ON call_logs (contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_outcome ON call_logs (outcome);
CREATE INDEX IF NOT EXISTS idx_contacts_dialer ON contacts (status, is_dnc, industry, state);
CREATE INDEX IF NOT EXISTS idx_pipeline_items_type_status ON pipeline_items (pipeline_type, status);
CREATE INDEX IF NOT EXISTS idx_pipeline_items_assigned ON pipeline_items (assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_items_created_by ON pipeline_items (created_by);
```

### 3. Add React Error Boundary
No error boundaries exist. A single component crash (e.g., in the dialer or reports) takes down the entire app with a white screen.

**Fix**: Create `src/components/ErrorBoundary.tsx` (class component) that catches render errors, shows a friendly "Something went wrong" message with a retry button, and wrap key routes in `App.tsx`.

### 4. Refactor DialerPage into Smaller Hooks
`DialerPage.tsx` is 1,377 lines with 35+ state variables. This makes it fragile and hard to modify.

**Fix**: Extract two custom hooks:
- `src/hooks/useDialerSession.ts` — session lifecycle (start/pause/resume/stop/recover), timers, counts, outcomes tracking (~150 lines)
- `src/hooks/useDialerDialpad.ts` — Dialpad call placement, resolution polling, status polling, cancel/hangup (~250 lines)

This reduces DialerPage to ~900 lines of pure UI rendering and outcome logic.

### 5. Replace Aggressive Polling with Realtime + Smarter Intervals
`call_logs` already has realtime enabled but no hook uses it. Six hooks poll every 15 seconds, generating constant database load.

**Fix**: 
- Update `useCallLogs` (dashboard feed) to use Supabase Realtime channel subscription instead of polling
- Increase `refetchInterval` from 15s to 60s on `useCallLogsByDateRange` and `useFollowUps` (reports don't need near-real-time)
- Keep 15s polling only for `useTodayCallCount` (small query, user-scoped)

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/useCallLogs.ts` | Add batched fetching, realtime subscription, adjust polling intervals |
| `src/hooks/useDialerSession.ts` | **New** — extracted session lifecycle hook |
| `src/hooks/useDialerDialpad.ts` | **New** — extracted Dialpad call management hook |
| `src/pages/DialerPage.tsx` | Consume new hooks, remove extracted logic |
| `src/components/ErrorBoundary.tsx` | **New** — React error boundary component |
| `src/App.tsx` | Wrap routes with ErrorBoundary |
| Migration | Add composite database indexes |

## Technical Details

- Error boundary must be a class component (React limitation for `componentDidCatch`)
- Realtime subscription uses `supabase.channel('call-logs-live').on('postgres_changes', ...)` and invalidates React Query cache on INSERT
- Batched fetching loops with `.range(from, to)` in 1000-row pages until returned count < page size
- Hook extraction preserves all existing callback signatures so DialerPage UI code changes are minimal (swap inline state for hook returns)

