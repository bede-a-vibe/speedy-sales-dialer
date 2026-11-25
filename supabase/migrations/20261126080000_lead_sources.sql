-- Lead sources beyond cold calling: SEO, Meta Ads, Google Ads spelled the way
-- people read them, and a way to record a meeting booked outside the dialer.
create or replace function public.normalise_lead_channel(_v text)
returns text language sql immutable set search_path to 'public' as $function$
  select case lower(btrim(coalesce(_v, '')))
    when ''               then null
    when 'ads'            then 'Ads'
    when 'seo'            then 'SEO'
    when 'meta ads'       then 'Meta Ads'
    when 'google ads'     then 'Google Ads'
    when 'linkedin'       then 'LinkedIn'
    when 'cold email'     then 'Cold Email'
    when 'cold call'      then 'Cold Call'
    when 'website'        then 'Website'
    when 'referral'       then 'Referral'
    when 'partnership'    then 'Partnership'
    when 'student'        then 'Student'
    when 'legacy/import'  then 'Legacy/Import'
    when 'booked session' then 'Booked Session'
    when 'other'          then 'Other'
    else initcap(btrim(_v))
  end;
$function$;

-- Contact (found by email or phone, else created) and booking in one go.
-- Admins only. The skip flag keeps it out of GHL: it is a record, not a booking request.
create or replace function public.log_outside_meeting(
  _business text, _person text, _phone text, _email text, _industry text,
  _source text, _detail text, _at timestamptz, _format text, _closer uuid
) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid();
  v_contact contacts%rowtype;
  v_existing boolean := false;
  v_digits text := right(regexp_replace(coalesce(_phone,''), '\D', '', 'g'), 9);
  v_item uuid;
begin
  if v_uid is null or not has_role(v_uid, 'admin'::app_role) then raise exception 'Only admins can log a meeting.'; end if;
  if coalesce(btrim(_business),'') = '' then raise exception 'Enter the business.'; end if;
  if coalesce(btrim(_source),'') = '' then raise exception 'Choose a lead source.'; end if;
  if _at is null then raise exception 'Enter the date and time.'; end if;
  if not exists (select 1 from profiles where user_id = _closer) then raise exception 'Choose a closer.'; end if;

  select * into v_contact from contacts c
   where c.is_archived is not true
     and ((coalesce(btrim(_email),'') <> '' and lower(c.email) = lower(btrim(_email)))
       or (length(v_digits) = 9 and right(regexp_replace(coalesce(c.phone,''), '\D', '', 'g'), 9) = v_digits))
   order by (lower(coalesce(c.email,'')) = lower(btrim(coalesce(_email,'')))) desc, c.created_at
   limit 1;

  if v_contact.id is not null then
    v_existing := true;
    if exists (select 1 from pipeline_items p where p.contact_id = v_contact.id and p.pipeline_type = 'booked'
                and abs(extract(epoch from p.scheduled_for - _at)) < 3 * 3600) then
      raise exception '% already has a meeting at that time.', v_contact.business_name;
    end if;
    update contacts set
      -- A source already recorded is never overwritten here; change it on the contact.
      lead_channel = coalesce(lead_channel, case when lead_type = 'cold' then null else btrim(_source) end),
      lead_source = coalesce(nullif(btrim(lead_source),''), nullif(btrim(_detail),'')),
      status = case when status in ('closed','dnc') then status when _at > now() then 'booked' else status end,
      meeting_booked_date = _at, updated_at = now()
    where id = v_contact.id;
  else
    insert into contacts (business_name, contact_person, phone, email, industry, lead_type, lead_channel, lead_source, status, meeting_booked_date)
    values (btrim(_business), nullif(btrim(_person),''), coalesce(btrim(_phone),''), nullif(btrim(_email),''), coalesce(nullif(btrim(_industry),''),'Other'),
            case when lower(btrim(_source)) = 'cold call' then 'cold' else 'inbound' end, btrim(_source), nullif(btrim(_detail),''), 'booked', _at)
    returning * into v_contact;
  end if;

  perform set_config('app.skip_ghl_sync', '1', true);
  insert into pipeline_items (contact_id, pipeline_type, assigned_user_id, created_by, scheduled_for, notes, status, meeting_format)
  values (v_contact.id, 'booked', _closer, v_uid, _at, 'Logged by hand: booked outside the dialer.', 'open', nullif(_format,''))
  returning id into v_item;
  perform set_config('app.skip_ghl_sync', '0', true);

  return jsonb_build_object('item_id', v_item, 'contact_id', v_contact.id, 'existing', v_existing, 'business_name', v_contact.business_name,
    'channel', (select contact_channel(c.lead_channel, c.lead_type) from contacts c where c.id = v_contact.id));
end $function$;
revoke all on function public.log_outside_meeting(text,text,text,text,text,text,text,timestamptz,text,uuid) from public, anon;
grant execute on function public.log_outside_meeting(text,text,text,text,text,text,text,timestamptz,text,uuid) to authenticated;
