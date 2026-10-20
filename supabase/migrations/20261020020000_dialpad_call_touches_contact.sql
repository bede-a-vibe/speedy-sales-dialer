-- Both reps claim from one pool with the same ordering; the only separation is the
-- 15-minute dialer_lead_locks on a claimed batch. claim_dialer_leads_core keeps a lead out
-- for 24/48 h only via contacts.last_called_at, which the rep's call LOG sets, not the
-- call itself. Anaconda Electrical, 20 Oct 2026: Ben rang at 15:25 (Dialpad), Bede's queue
-- claimed it at 15:37, Ben logged the booking at 15:38. A synced Dialpad call now stamps
-- last_called_at as soon as it lands. Applied to prod 20 Oct 2026.
CREATE OR REPLACE FUNCTION public.dialpad_call_touches_contact()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if new.contact_id is null or new.started_at is null then return new; end if;
  if coalesce(new.direction, 'outbound') <> 'outbound' then return new; end if;
  update contacts set last_called_at = new.started_at, updated_at = now()
   where id = new.contact_id and (last_called_at is null or last_called_at < new.started_at);
  return new;
end;
$function$;
DROP TRIGGER IF EXISTS trg_dialpad_call_touches_contact ON public.dialpad_calls;
CREATE TRIGGER trg_dialpad_call_touches_contact AFTER INSERT OR UPDATE OF contact_id, started_at ON public.dialpad_calls
  FOR EACH ROW EXECUTE FUNCTION public.dialpad_call_touches_contact();
