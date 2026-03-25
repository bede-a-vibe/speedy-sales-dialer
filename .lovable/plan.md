

## Diagnosis

The dialer queue is working as designed, but the design lacks a **recency cooldown**. Here's what happens:

1. You call a lead with `call_attempt_count = 1` and log "No Answer"
2. The lead stays `status = 'uncalled'` and its `call_attempt_count` increments to `2`
3. The lock is released immediately when you log the outcome
4. On the next buffer refill, if most remaining leads have `call_attempt_count >= 2`, that same lead is eligible again — potentially within minutes

There is no `last_called_at` timestamp or cooldown window, so recently-called leads can be re-served in the same session.

## Plan

### 1. Add a `last_called_at` column to `contacts`

Add a migration to create a `last_called_at` timestamp column on `contacts`, and update the existing `sync_contact_call_attempt_count` trigger to also set `last_called_at = now()` on INSERT.

### 2. Update `claim_dialer_leads` to enforce a cooldown

Modify the SQL function to exclude contacts where `last_called_at` is within a configurable cooldown window (e.g., 2 hours). Add a new parameter `_cooldown_minutes` (default 120) and filter: `AND (c.last_called_at IS NULL OR c.last_called_at < now() - make_interval(mins => _cooldown_minutes))`.

### 3. Update `get_dialer_queue_count` to match

Apply the same cooldown filter to the queue count function so the preview count accurately reflects available leads.

### 4. Pass cooldown parameter from the frontend (optional)

The default of 120 minutes will work without frontend changes. If you want it configurable, add a UI control on the dialer settings page.

### Technical Details

**Migration SQL (new column + updated trigger):**
```sql
ALTER TABLE public.contacts
ADD COLUMN IF NOT EXISTS last_called_at timestamptz;

-- Backfill from most recent call_log
UPDATE public.contacts c
SET last_called_at = sub.max_created
FROM (
  SELECT contact_id, MAX(created_at) AS max_created
  FROM public.call_logs
  GROUP BY contact_id
) sub
WHERE c.id = sub.contact_id;

-- Update trigger to set last_called_at
CREATE OR REPLACE FUNCTION public.sync_contact_call_attempt_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.contacts
    SET call_attempt_count = COALESCE(call_attempt_count, 0) + 1,
        last_called_at = now(),
        updated_at = now()
    WHERE id = NEW.contact_id;
  -- ... keep existing DELETE/UPDATE logic
  END IF;
  RETURN NULL;
END;
$$;
```

**Updated `claim_dialer_leads` filter (add to the `visible_contacts` CTE WHERE clause):**
```sql
AND (c.last_called_at IS NULL
     OR c.last_called_at < now() - make_interval(mins => _cooldown_minutes))
```

**Files to modify:**
- New database migration (add column, backfill, update trigger, update both RPC functions)
- No frontend code changes needed — the cooldown is enforced server-side

