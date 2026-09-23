-- ─────────────────────────────────────────────────────────────────────────
-- Sync rep-written manual contact notes through to GoHighLevel.
--
-- Sync state lives ON the note itself (not in pending_ghl_pushes, whose
-- dialpad_call_id / user_id columns are NOT NULL and so structurally cannot
-- carry a note that isn't tied to a Dialpad call).
--
-- The invariant that prevents duplicate notes in GHL:
--   ghl_note_id IS NOT NULL  →  this note already exists in GHL.
--                               Never POST it again; PUT to update it.
--   ghl_synced_at IS NULL    →  this note needs a push (create or update).
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.contact_notes
  ADD COLUMN IF NOT EXISTS ghl_note_id text,
  ADD COLUMN IF NOT EXISTS ghl_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS ghl_sync_error text,
  ADD COLUMN IF NOT EXISTS ghl_sync_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ghl_next_retry_at timestamptz NOT NULL DEFAULT now(),
  -- Opt-in switch. Added with DEFAULT false so every pre-existing note lands
  -- un-enrolled; the default flips to true immediately below so notes created
  -- from here on sync automatically. Doing it in this order means applying
  -- this migration does NOT fire thousands of writes at GHL, and it avoids
  -- rewriting the table or bumping updated_at on every historical note.
  ADD COLUMN IF NOT EXISTS ghl_sync_enrolled boolean NOT NULL DEFAULT false;

-- ── BACKFILL IS OFF BY DEFAULT ───────────────────────────────────────────
-- From here on, new notes are enrolled automatically. Historical notes stay
-- un-enrolled until an admin runs the explicit, rate-limited backfill action.
ALTER TABLE public.contact_notes
  ALTER COLUMN ghl_sync_enrolled SET DEFAULT true;

COMMENT ON COLUMN public.contact_notes.ghl_note_id IS
  'GHL note id once pushed. Non-null means the note exists in GHL — update it, never re-create it.';
COMMENT ON COLUMN public.contact_notes.ghl_synced_at IS
  'When the current content was last confirmed in GHL. NULL means a push is owed.';
COMMENT ON COLUMN public.contact_notes.ghl_sync_enrolled IS
  'False for notes that predate GHL note sync. The admin backfill flips these on in rate-limited batches.';

-- ── Indexes ──────────────────────────────────────────────────────────────

-- Hard guarantee against two dialer notes mapping to the same GHL note.
CREATE UNIQUE INDEX IF NOT EXISTS uq_contact_notes_ghl_note_id
  ON public.contact_notes (ghl_note_id)
  WHERE ghl_note_id IS NOT NULL;

-- Drives the drain: enrolled manual notes that still owe a push.
CREATE INDEX IF NOT EXISTS idx_contact_notes_ghl_sync_pending
  ON public.contact_notes (ghl_next_retry_at)
  WHERE ghl_sync_enrolled AND ghl_synced_at IS NULL AND source = 'manual';

-- Drives the resumable backfill cursor over historical notes.
CREATE INDEX IF NOT EXISTS idx_contact_notes_ghl_backfill_cursor
  ON public.contact_notes (created_at)
  WHERE NOT ghl_sync_enrolled AND source = 'manual';

-- ── Edits: re-queue an already-synced note as an in-place update ─────────
-- Clears ghl_synced_at (so the drain picks it up) but KEEPS ghl_note_id (so
-- the drain issues PUT /contacts/{id}/notes/{noteId} instead of a second POST).
CREATE OR REPLACE FUNCTION public.mark_contact_note_ghl_dirty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content THEN
    NEW.ghl_synced_at := NULL;
    NEW.ghl_sync_error := NULL;
    NEW.ghl_sync_attempts := 0;
    NEW.ghl_next_retry_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contact_notes_ghl_dirty ON public.contact_notes;
CREATE TRIGGER trg_contact_notes_ghl_dirty
BEFORE UPDATE OF content ON public.contact_notes
FOR EACH ROW
EXECUTE FUNCTION public.mark_contact_note_ghl_dirty();

-- ── Deletes: tombstone queue ─────────────────────────────────────────────
-- A deleted row can't carry its own sync state, so record the GHL coordinates
-- at delete time and let the drain remove the note from GHL.
CREATE TABLE IF NOT EXISTS public.ghl_note_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_note_id uuid NOT NULL,
  ghl_contact_id text NOT NULL,
  ghl_note_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'deleted', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ghl_note_deletions_ghl_note_id
  ON public.ghl_note_deletions (ghl_note_id);

CREATE INDEX IF NOT EXISTS idx_ghl_note_deletions_status_retry
  ON public.ghl_note_deletions (status, next_retry_at);

DROP TRIGGER IF EXISTS update_ghl_note_deletions_updated_at ON public.ghl_note_deletions;
CREATE TRIGGER update_ghl_note_deletions_updated_at
BEFORE UPDATE ON public.ghl_note_deletions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.enqueue_ghl_note_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ghl_contact_id text;
BEGIN
  -- Never synced → nothing exists in GHL to delete.
  IF OLD.ghl_note_id IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT c.ghl_contact_id INTO v_ghl_contact_id
  FROM public.contacts c
  WHERE c.id = OLD.contact_id;

  -- No contact row (e.g. this delete is a cascade from contacts) — GHL drops
  -- notes with their contact, so there is nothing left to clean up.
  IF v_ghl_contact_id IS NULL THEN
    RETURN OLD;
  END IF;

  INSERT INTO public.ghl_note_deletions (contact_note_id, ghl_contact_id, ghl_note_id)
  VALUES (OLD.id, v_ghl_contact_id, OLD.ghl_note_id)
  ON CONFLICT (ghl_note_id) DO NOTHING;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_contact_notes_ghl_delete ON public.contact_notes;
CREATE TRIGGER trg_contact_notes_ghl_delete
AFTER DELETE ON public.contact_notes
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_ghl_note_deletion();

-- ── RLS on the tombstone queue (mirrors pending_ghl_pushes) ──────────────
ALTER TABLE public.ghl_note_deletions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages ghl_note_deletions" ON public.ghl_note_deletions;
CREATE POLICY "Service role manages ghl_note_deletions"
  ON public.ghl_note_deletions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can read ghl_note_deletions" ON public.ghl_note_deletions;
CREATE POLICY "Admins can read ghl_note_deletions"
  ON public.ghl_note_deletions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
