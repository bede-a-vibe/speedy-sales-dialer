-- Caller ID rotation, part 2: set the rep's caller ID in Dialpad.
--
-- Dialpad ignored the per-call outbound_caller_id the embedded CTI sends:
-- Dialpad call records (internal_number) showed every call on the rep's main
-- number, whatever the dialer asked for (Bede 16 Nov, Ben and Lachlan 18 Nov).
-- The dialpad edge function action sync_rep_caller_ids now picks
-- pool[floor(rotation_dial_count / 40) % pool_size] and sets it as the rep's
-- Dialpad caller ID (POST /users/{id}/caller_id) when it changes.
-- These columns record what was last set.

ALTER TABLE public.dialpad_settings
  ADD COLUMN IF NOT EXISTS active_caller_id text,
  ADD COLUMN IF NOT EXISTS caller_id_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS caller_id_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS caller_id_error text;

-- Cron (pg_cron), scheduled out of band because the header carries the
-- internal cron secret:
--   dialpad-caller-id-rotation  * * * * *  POST dialpad {action: sync_rep_caller_ids}
--                                          (x-cron-secret header). Only calls
--                                          Dialpad when a rep's number changes.
