-- Captured-detail filters: the fields restored to the Intelligence tab in
-- PR #185 are now filterable too.
--   Marketing: SEO Visibility
--   Lead & booking: Lifecycle Stage, Lifecycle Reason, Lead Type, Lead Channel,
--     Call Disposition (last_outcome), Meeting Booked Date, Setter Name,
--     Assigned Closer, Meeting Source, Meeting Set By (Role)
--   Decision maker & gatekeeper: Mobile Reaches Gatekeeper
--
-- New 'date' kind (eq/gte/lte by Melbourne date, is_set/is_not_set) for
-- meeting_booked_date. Text kinds now compare c.<col>::text so the enum
-- last_outcome works (with underscores read as spaces: "no answer"). Setter,
-- closer, source and role are worked out from the latest booked
-- pipeline_items row, matching the Intelligence tab.
-- get_contact_detail_coverage() picks the new fields up from the whitelist.

create or replace function public.dialer_detail_fields()
returns table(field text, kind text)
language sql
immutable
set search_path = public
as $$
  values
    -- Team & business
    ('business_size', 'text'),
    ('team_size', 'int'),
    ('number_of_trucks_vans', 'int'),
    ('years_in_business', 'int'),
    ('work_type', 'text'),
    ('service_area', 'text'),
    ('estimated_annual_revenue', 'text'),
    ('abn', 'text'),
    ('website', 'text'),
    -- Qualification
    ('buying_signal_strength', 'text'),
    ('budget_indication', 'text'),
    ('authority_level', 'text'),
    ('buying_timeline', 'text'),
    ('need_identified', 'text'),
    ('current_solution_satisfaction', 'text'),
    ('contract_lockin_status', 'text'),
    ('key_objection', 'text'),
    -- Marketing
    ('has_google_ads', 'tri'),
    ('has_facebook_ads', 'tri'),
    ('has_seo', 'tri'),
    ('has_existing_agency', 'bool'),
    ('existing_agency_name', 'text'),
    ('existing_agency_services', 'tags'),
    ('existing_agency_notes', 'text'),
    ('current_monthly_ad_spend', 'text'),
    ('current_marketing_channels', 'csv'),
    ('agency_satisfaction', 'text'),
    ('lead_source_dependency', 'text'),
    ('marketing_pain_points', 'text'),
    -- Call intel
    ('last_call_sentiment', 'text'),
    ('problem_resonance', 'text'),
    ('key_quote', 'text'),
    ('competitive_intel', 'text'),
    ('agreed_next_steps', 'text'),
    ('call_intel_summary', 'text'),
    ('objection_notes', 'text'),
    ('preferred_contact_method', 'text'),
    ('best_time_to_call', 'text'),
    ('call_intel_source', 'text'),
    ('team_size_source', 'text'),
    ('seo_visibility', 'text'),
    -- Lead & booking
    ('lifecycle_stage', 'text'),
    ('lifecycle_reason', 'text'),
    ('lead_type', 'text'),
    ('lead_channel', 'text'),
    ('last_outcome', 'text'),
    ('meeting_booked_date', 'date'),
    ('setter_name', 'text'),
    ('assigned_closer', 'text'),
    ('meeting_source', 'text'),
    ('meeting_set_by_role', 'text'),
    -- Decision maker & gatekeeper
    ('dm_name', 'text'),
    ('dm_role', 'text'),
    ('dm_phone', 'text'),
    ('dm_phone_type', 'text'),
    ('dm_email', 'text'),
    ('dm_linkedin', 'text'),
    ('gatekeeper_name', 'text'),
    ('gatekeeper_role', 'text'),
    ('gatekeeper_notes', 'text'),
    ('best_route_to_decision_maker', 'text'),
    ('mobile_reaches_gatekeeper', 'bool')
$$;

create or replace function public.dialer_detail_predicate(_filter jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  _field text := _filter->>'field';
  _op text := _filter->>'op';
  _value jsonb := _filter->'value';
  _kind text;
  _col text;
  _scalar text;
  _list text[];
  _ints int[];
  _like text;
begin
  if jsonb_typeof(_filter) is distinct from 'object' then
    raise exception 'detail filter must be an object, got %', coalesce(jsonb_typeof(_filter), 'null');
  end if;
  select f.kind into _kind from public.dialer_detail_fields() f where f.field = _field;
  if _kind is null then
    raise exception 'detail filter field not allowed: %', coalesce(_field, '(missing)');
  end if;
  -- Text kinds compare as text, so enum columns (last_outcome) filter too.
  -- Booking fields are worked out from the lead's latest booked meeting.
  _col := case _field
    when 'last_outcome' then $x$replace(c.last_outcome::text, '_', ' ')$x$
    when 'setter_name' then $x$(SELECT COALESCE(NULLIF(btrim(pr.display_name), ''), split_part(pr.email, '@', 1)) FROM public.pipeline_items pi LEFT JOIN public.profiles pr ON pr.user_id = pi.created_by WHERE pi.contact_id = c.id AND pi.pipeline_type = 'booked' ORDER BY pi.created_at DESC LIMIT 1)$x$
    when 'assigned_closer' then $x$(SELECT COALESCE(NULLIF(btrim(pr.display_name), ''), split_part(pr.email, '@', 1)) FROM public.pipeline_items pi LEFT JOIN public.profiles pr ON pr.user_id = pi.assigned_user_id WHERE pi.contact_id = c.id AND pi.pipeline_type = 'booked' ORDER BY pi.created_at DESC LIMIT 1)$x$
    when 'meeting_source' then $x$(SELECT CASE WHEN pi.source_call_log_id IS NOT NULL THEN 'Dialer call' ELSE 'GHL calendar' END FROM public.pipeline_items pi WHERE pi.contact_id = c.id AND pi.pipeline_type = 'booked' ORDER BY pi.created_at DESC LIMIT 1)$x$
    when 'meeting_set_by_role' then $x$(SELECT CASE WHEN pi.created_by IS NULL OR pi.assigned_user_id IS NULL THEN NULL WHEN pi.created_by = pi.assigned_user_id THEN 'Closer (self-booked)' ELSE 'Setter' END FROM public.pipeline_items pi WHERE pi.contact_id = c.id AND pi.pipeline_type = 'booked' ORDER BY pi.created_at DESC LIMIT 1)$x$
    else case when _kind in ('text', 'csv') then format('c.%I::text', _field) else format('c.%I', _field) end
  end;

  -- Value shape checks, per op.
  if _op in ('eq', 'contains', 'gte', 'lte') then
    if jsonb_typeof(_value) not in ('string', 'number', 'boolean') then
      raise exception 'detail filter %/% needs a single value', _field, _op;
    end if;
    _scalar := btrim(_value #>> '{}');
    if _scalar = '' or length(_scalar) > 200 then
      raise exception 'detail filter %/% value must be 1-200 characters', _field, _op;
    end if;
  elsif _op in ('in', 'not_in') then
    if jsonb_typeof(_value) is distinct from 'array' or jsonb_array_length(_value) not between 1 and 50 then
      raise exception 'detail filter %/% needs a list of 1-50 values', _field, _op;
    end if;
    select array_agg(btrim(v)) into _list from jsonb_array_elements_text(_value) v;
    if exists (select 1 from unnest(_list) v where v = '' or length(v) > 200) then
      raise exception 'detail filter %/% values must be 1-200 characters', _field, _op;
    end if;
  elsif _op not in ('is_set', 'is_not_set') then
    raise exception 'detail filter op not allowed: %', coalesce(_op, '(missing)');
  end if;

  if _kind = 'int' then
    if _op in ('eq', 'gte', 'lte') and _scalar !~ '^-?[0-9]{1,9}$' then
      raise exception 'detail filter %/% needs a whole number', _field, _op;
    end if;
    if _op in ('in', 'not_in') then
      if exists (select 1 from unnest(_list) v where v !~ '^-?[0-9]{1,9}$') then
        raise exception 'detail filter %/% needs whole numbers', _field, _op;
      end if;
      _ints := _list::int[];
    end if;
    return case _op
      when 'eq' then format('%s = %s', _col, _scalar::int)
      when 'gte' then format('%s >= %s', _col, _scalar::int)
      when 'lte' then format('%s <= %s', _col, _scalar::int)
      when 'in' then format('%s = ANY(%L::int[])', _col, _ints::text)
      when 'not_in' then format('(%s IS NULL OR %s <> ALL(%L::int[]))', _col, _col, _ints::text)
      when 'is_set' then format('%s IS NOT NULL', _col)
      when 'is_not_set' then format('%s IS NULL', _col)
      else public.dialer_detail_reject(_field, _op)
    end;
  end if;

  if _kind = 'date' then
    if _op in ('eq', 'gte', 'lte') and _scalar !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'detail filter %/% needs a date (YYYY-MM-DD)', _field, _op;
    end if;
    return case _op
      when 'eq' then format('(c.%I AT TIME ZONE %L)::date = %L::date', _field, 'Australia/Melbourne', _scalar)
      when 'gte' then format('(c.%I AT TIME ZONE %L)::date >= %L::date', _field, 'Australia/Melbourne', _scalar)
      when 'lte' then format('(c.%I AT TIME ZONE %L)::date <= %L::date', _field, 'Australia/Melbourne', _scalar)
      when 'is_set' then format('c.%I IS NOT NULL', _field)
      when 'is_not_set' then format('c.%I IS NULL', _field)
      else public.dialer_detail_reject(_field, _op)
    end;
  end if;

  if _kind = 'bool' then
    if _op = 'eq' and lower(_scalar) not in ('true', 'false') then
      raise exception 'detail filter %/eq needs true or false', _field;
    end if;
    return case _op
      when 'eq' then format('%s = %s', _col, case when lower(_scalar) = 'true' then 'true' else 'false' end)
      when 'is_set' then format('%s IS NOT NULL', _col)
      when 'is_not_set' then format('%s IS NULL', _col)
      else public.dialer_detail_reject(_field, _op)
    end;
  end if;

  if _op = 'contains' then
    _like := '%' || replace(replace(replace(_scalar, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  _list := array(select lower(v) from unnest(_list) v);

  if _kind = 'tags' then
    return case _op
      when 'eq' then format('lower(%L) = ANY(SELECT lower(e) FROM unnest(%s) e)', _scalar, _col)
      when 'in' then format('EXISTS (SELECT 1 FROM unnest(%s) e WHERE lower(e) = ANY(%L::text[]))', _col, _list::text)
      when 'contains' then format('EXISTS (SELECT 1 FROM unnest(%s) e WHERE e ILIKE %L)', _col, _like)
      when 'is_set' then format('COALESCE(cardinality(%s), 0) > 0', _col)
      when 'is_not_set' then format('COALESCE(cardinality(%s), 0) = 0', _col)
      else public.dialer_detail_reject(_field, _op)
    end;
  end if;

  if _kind = 'csv' then
    return case _op
      when 'eq' then format('EXISTS (SELECT 1 FROM unnest(string_to_array(%s, %L)) e WHERE lower(btrim(e)) = lower(%L))', _col, ',', _scalar)
      when 'in' then format('EXISTS (SELECT 1 FROM unnest(string_to_array(%s, %L)) e WHERE lower(btrim(e)) = ANY(%L::text[]))', _col, ',', _list::text)
      when 'contains' then format('%s ILIKE %L', _col, _like)
      when 'is_set' then format('NULLIF(btrim(%s), %L) IS NOT NULL', _col, '')
      when 'is_not_set' then format('NULLIF(btrim(%s), %L) IS NULL', _col, '')
      else public.dialer_detail_reject(_field, _op)
    end;
  end if;

  if _kind = 'tri' then
    -- Older rows hold 'true'/'false'; read them as yes/no.
    _col := format('(CASE lower(btrim(c.%I)) WHEN %L THEN %L WHEN %L THEN %L ELSE lower(btrim(c.%I)) END)',
      _field, 'true', 'yes', 'false', 'no', _field);
    return case _op
      when 'eq' then format('%s = lower(%L)', _col, _scalar)
      when 'in' then format('%s = ANY(%L::text[])', _col, _list::text)
      when 'not_in' then format('(%s IS NULL OR %s <> ALL(%L::text[]))', _col, _col, _list::text)
      when 'is_set' then format('%s IN (%L, %L)', _col, 'yes', 'no')
      when 'is_not_set' then format('(%s IS NULL OR %s NOT IN (%L, %L))', _col, _col, 'yes', 'no')
      else public.dialer_detail_reject(_field, _op)
    end;
  end if;

  -- text
  return case _op
    when 'eq' then format('lower(btrim(%s)) = lower(%L)', _col, _scalar)
    when 'in' then format('lower(btrim(%s)) = ANY(%L::text[])', _col, _list::text)
    when 'not_in' then format('(%s IS NULL OR lower(btrim(%s)) <> ALL(%L::text[]))', _col, _col, _list::text)
    when 'contains' then format('%s ILIKE %L', _col, _like)
    when 'is_set' then format('NULLIF(btrim(%s), %L) IS NOT NULL', _col, '')
    when 'is_not_set' then format('NULLIF(btrim(%s), %L) IS NULL', _col, '')
    else public.dialer_detail_reject(_field, _op)
  end;
end;
$$;

notify pgrst, 'reload schema';
