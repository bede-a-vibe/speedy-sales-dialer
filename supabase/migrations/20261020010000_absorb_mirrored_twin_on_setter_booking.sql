-- Ben books in the GHL calendar first and logs the dialer booking a minute later. By then the
-- GHL -> dialer mirror (20261013020000) has already created a row from the calendar event, so the
-- setter's own booking became a duplicate (2S Electrical, 19 Oct 2026: two no-shows for one slot).
-- The setter's row supersedes the mirrored one. Applied to prod 20 Oct 2026.
CREATE OR REPLACE FUNCTION public.absorb_mirrored_twin()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_twin pipeline_items%rowtype;
begin
  if new.pipeline_type <> 'booked' or new.scheduled_for is null or new.contact_id is null then return new; end if;
  -- This insert IS the mirror; nothing to absorb.
  if current_setting('app.skip_ghl_sync', true) = '1' then return new; end if;

  select p.* into v_twin from pipeline_items p
   where p.contact_id = new.contact_id and p.pipeline_type = 'booked'
     and p.status = 'open' and p.appointment_outcome is null
     and (p.notes like 'Mirrored from GHL calendar:%' or p.notes like 'Rebooked in GHL for%')
     and abs(extract(epoch from (p.scheduled_for - new.scheduled_for))) < 3 * 3600
   order by abs(extract(epoch from (p.scheduled_for - new.scheduled_for))) asc
   limit 1;
  if v_twin.id is null then return new; end if;

  new.is_qualified := coalesce(new.is_qualified, v_twin.is_qualified);
  new.reschedule_count := greatest(coalesce(new.reschedule_count, 0), coalesce(v_twin.reschedule_count, 0));
  begin
    delete from pipeline_items where id = v_twin.id;
    new.notes := concat_ws(' | ', nullif(btrim(new.notes), ''), 'Supersedes the GHL-mirrored row for the same slot');
  exception when others then
    raise log '[absorb_mirrored_twin] could not remove mirrored twin %: %', v_twin.id, sqlerrm;
  end;
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_absorb_mirrored_twin ON public.pipeline_items;
CREATE TRIGGER trg_absorb_mirrored_twin BEFORE INSERT ON public.pipeline_items
  FOR EACH ROW EXECUTE FUNCTION public.absorb_mirrored_twin();
