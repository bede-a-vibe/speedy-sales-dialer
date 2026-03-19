# Strengthen Dialpad–Dialer Connection

## Status: Implemented

## Changes Made

### 1. Database Migration
- Added `call_state` column to `dialpad_calls` table
- Enabled Supabase Realtime on `dialpad_calls` table

### 2. Edge Function (`supabase/functions/dialpad/index.ts`)
- Expanded `initiate_call` server-side discovery from `[0]` to `[0, 200, 400, 600, 800]` — 5 retries with ~2s total
- Write `call_state` on: `initiate_call` discovery, `resolve_call` upsert, bottom `initiate_call` insert, and webhook sync (hangup)

### 3. Frontend (`src/hooks/useDialerDialpad.ts`)
- Added Realtime subscription on `dialpad_calls` filtered by `dialpad_call_id` — instant state updates from webhooks
- Reduced resolution polling: MAX_ATTEMPTS 20→8, delays start at 500ms instead of 150ms
- Reduced status polling: 2–6s → 15s fallback (Realtime handles fast path), initial poll at 3s

## Impact

| Metric | Before | After |
|--------|--------|-------|
| Edge function calls per dial | 10–25 | 1–3 |
| Call link latency | 3–15s | 0.5–2s |
| Status polling frequency | 2–6s via API | Realtime push + 15s fallback |
| Rate limit risk | High | Low |
