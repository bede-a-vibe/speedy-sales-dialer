-- Trigger function: when a follow-up pipeline_item is auto-created (by the outcome trigger),
-- call the GHL edge function to create a task in GHL for the assigned rep.
-- This uses pg_net to make an async HTTP call to the GHL edge function.

-- First, ensure pg_net extension is available
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create a function that pushes follow-up tasks to GHL via the edge function
CREATE OR REPLACE FUNCTION public.sync_followup_to_ghl()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _ghl_contact_id text;
  _contact_name text;
  _supabase_url text;
  _service_role_key text;
  _ghl_api_key text;
  _ghl_location_id text;
  _request_body jsonb;
BEGIN
  -- Only act on follow-up pipeline items
  IF NEW.pipeline_type <> 'follow_up' THEN
    RETURN NEW;
  END IF;

  -- Only act on newly created items (not updates)
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- Look up the contact's GHL contact ID
  SELECT ghl_contact_id, 
         COALESCE(first_name || ' ' || last_name, company_name, 'Contact')
  INTO _ghl_contact_id, _contact_name
  FROM public.contacts
  WHERE id = NEW.contact_id;

  -- If no GHL contact ID, skip
  IF _ghl_contact_id IS NULL OR _ghl_contact_id = '' THEN
    RAISE LOG '[sync_followup_to_ghl] No ghl_contact_id for contact_id=%, skipping', NEW.contact_id;
    RETURN NEW;
  END IF;

  -- Get environment config from vault or hardcoded (Supabase edge function will use its own env vars)
  _supabase_url := current_setting('app.settings.supabase_url', true);
  _service_role_key := current_setting('app.settings.service_role_key', true);

  -- If we can't get the URL/key from settings, try the Supabase-provided config
  IF _supabase_url IS NULL OR _supabase_url = '' THEN
    -- Fallback: use the known Supabase URL from the project
    _supabase_url := 'https://xhcvwhcpaeetmmzkuwyw.supabase.co';
  END IF;

  IF _service_role_key IS NULL OR _service_role_key = '' THEN
    RAISE LOG '[sync_followup_to_ghl] service_role_key not available, skipping GHL sync for follow-up';
    RETURN NEW;
  END IF;

  -- Build the request body for the GHL edge function
  _request_body := jsonb_build_object(
    'action', 'create_task',
    'contactId', _ghl_contact_id,
    'payload', jsonb_build_object(
      'title', COALESCE(NEW.notes, 'Follow-Up Call'),
      'body', 'Auto-created follow-up from Speedy Sales Dialer. Contact: ' || _contact_name,
      'dueDate', to_char(NEW.scheduled_for AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'completed', false
    )
  );

  -- Make async HTTP call to the GHL edge function via pg_net
  PERFORM extensions.http_post(
    url := _supabase_url || '/functions/v1/ghl',
    body := _request_body::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_role_key
    )
  );

  RAISE LOG '[sync_followup_to_ghl] Queued GHL task creation for contact_id=% ghl_contact_id=%', NEW.contact_id, _ghl_contact_id;

  RETURN NEW;
END;
$$;

-- Attach the trigger to pipeline_items (AFTER INSERT so it runs after the outcome trigger)
DROP TRIGGER IF EXISTS trg_sync_followup_to_ghl ON public.pipeline_items;
CREATE TRIGGER trg_sync_followup_to_ghl
  AFTER INSERT ON public.pipeline_items
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_followup_to_ghl();
