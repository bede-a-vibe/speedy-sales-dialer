CREATE OR REPLACE FUNCTION public.sync_booking_to_ghl()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _ghl_contact_id text;
  _contact_name text;
  _contact_phone text;
  _contact_business text;
  _supabase_url text;
  _service_role_key text;
  _request_body jsonb;
BEGIN
  IF NEW.pipeline_type <> 'booked' THEN
    RETURN NEW;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  SELECT ghl_contact_id,
         COALESCE(contact_person, business_name, 'Contact'),
         phone,
         business_name
  INTO _ghl_contact_id, _contact_name, _contact_phone, _contact_business
  FROM public.contacts
  WHERE id = NEW.contact_id;

  _supabase_url := current_setting('app.settings.supabase_url', true);
  _service_role_key := current_setting('app.settings.service_role_key', true);

  IF _supabase_url IS NULL OR _supabase_url = '' THEN
    _supabase_url := 'https://xhcvwhcpaeetmmzkuwyw.supabase.co';
  END IF;

  IF _service_role_key IS NULL OR _service_role_key = '' THEN
    RAISE LOG '[sync_booking_to_ghl] service_role_key not available, skipping GHL sync';
    RETURN NEW;
  END IF;

  IF _ghl_contact_id IS NULL OR _ghl_contact_id = '' THEN
    IF _contact_phone IS NOT NULL AND _contact_phone <> '' THEN
      RAISE LOG '[sync_booking_to_ghl] No ghl_contact_id for contact_id=%, attempting auto-link via upsert', NEW.contact_id;

      PERFORM extensions.http_post(
        url := _supabase_url || '/functions/v1/ghl',
        body := jsonb_build_object(
          'action', 'upsert_contact',
          'supabaseContactId', NEW.contact_id,
          'payload', jsonb_build_object(
            'phone', _contact_phone,
            'companyName', COALESCE(_contact_business, ''),
            'name', _contact_name
          )
        )::text,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || _service_role_key
        )
      );

      RAISE LOG '[sync_booking_to_ghl] Queued GHL upsert for contact_id=% phone=%', NEW.contact_id, _contact_phone;
    ELSE
      RAISE LOG '[sync_booking_to_ghl] No ghl_contact_id and no phone for contact_id=%, skipping', NEW.contact_id;
    END IF;

    RETURN NEW;
  END IF;

  _request_body := jsonb_build_object(
    'action', 'create_opportunity',
    'payload', jsonb_build_object(
      'pipelineId', 'QuBn7UX5zebPTd4fqW9x',
      'pipelineStageId', 'd7283fa5-7352-4446-80c6-1e567a7c8295',
      'contactId', _ghl_contact_id,
      'name', _contact_name || ' – Booked ' || to_char(NEW.scheduled_for AT TIME ZONE 'Australia/Melbourne', 'DD/MM/YYYY'),
      'status', 'open'
    )
  );

  PERFORM extensions.http_post(
    url := _supabase_url || '/functions/v1/ghl',
    body := _request_body::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_role_key
    )
  );

  PERFORM extensions.http_post(
    url := _supabase_url || '/functions/v1/ghl',
    body := jsonb_build_object(
      'action', 'add_note',
      'contactId', _ghl_contact_id,
      'payload', jsonb_build_object(
        'body', 'Appointment Booked: ' || to_char(NEW.scheduled_for AT TIME ZONE 'Australia/Melbourne', 'DD/MM/YYYY HH12:MI AM') || E'\n' ||
                'Notes: ' || COALESCE(NEW.notes, 'No notes') || E'\n' ||
                'Logged via Speedy Sales Dialer (server-side sync)'
      )
    )::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_role_key
    )
  );

  RAISE LOG '[sync_booking_to_ghl] Queued GHL opportunity + note for contact_id=% ghl_contact_id=%', NEW.contact_id, _ghl_contact_id;

  RETURN NEW;
END;
$$;