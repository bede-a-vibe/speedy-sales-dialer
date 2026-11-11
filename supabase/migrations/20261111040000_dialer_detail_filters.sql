-- Dialer queue: filter on any captured detail through ONE jsonb parameter.
--
-- claim_dialer_leads and get_dialer_queue_count take _detail_filters jsonb, an
-- array of {field, op, value}. Every criterion must match (AND). The fields a
-- client may name are the rows of dialer_detail_fields(); anything else is
-- rejected with an error, never interpolated. Column names reach SQL only via
-- format('%I') after the whitelist lookup, and values only via format('%L').
--
-- To make a new column filterable: add one row to dialer_detail_fields() and one
-- entry to DETAIL_FIELDS in src/lib/dialerDetailFilters.ts.
--
-- Ops by kind:
--   text   eq, in, not_in, contains, is_set, is_not_set    (case-insensitive, trimmed)
--   tri    eq, in, not_in, is_set, is_not_set              ('yes'/'no'/'unknown'; set = yes or no)
--   csv    eq, in, contains, is_set, is_not_set            (comma list: eq/in match any item)
--   int    eq, in, not_in, gte, lte, is_set, is_not_set
--   bool   eq, is_set, is_not_set
--   tags   eq, in, contains, is_set, is_not_set            (text[]: eq/in match any element)
-- not_in keeps blanks (a lead with no value is "not one of" the list).
-- Every other op excludes blanks.
--
-- Existing per-field params (_business_size etc.) are unchanged, so saved smart
-- lists and presets keep working.

create or replace function public.dialer_detail_fields()
returns table(field text, kind text)
language sql
immutable
set search_path = public
as $$
  values
    -- Team size
    ('business_size', 'text'),
    ('team_size', 'int'),
    ('team_size_source', 'text'),
    -- Call intel (backfilled from transcripts, 11 Nov 2026)
    ('service_area', 'text'),
    ('number_of_trucks_vans', 'int'),
    ('estimated_annual_revenue', 'text'),
    ('need_identified', 'text'),
    ('current_solution_satisfaction', 'text'),
    ('contract_lockin_status', 'text'),
    ('key_objection', 'text'),
    ('objection_notes', 'text'),
    ('current_monthly_ad_spend', 'text'),
    ('current_marketing_channels', 'csv'),
    ('agency_satisfaction', 'text'),
    ('lead_source_dependency', 'text'),
    ('marketing_pain_points', 'text'),
    ('problem_resonance', 'text'),
    ('competitive_intel', 'text'),
    ('gatekeeper_role', 'text'),
    ('preferred_contact_method', 'text'),
    ('call_intel_summary', 'text'),
    ('call_intel_source', 'text'),
    -- Older capture fields
    ('work_type', 'text'),
    ('has_google_ads', 'tri'),
    ('has_facebook_ads', 'tri'),
    ('has_seo', 'tri'),
    ('has_existing_agency', 'bool'),
    ('existing_agency_services', 'tags'),
    ('buying_signal_strength', 'text'),
    ('last_call_sentiment', 'text'),
    ('years_in_business', 'int'),
    ('dm_name', 'text'),
    ('dm_phone', 'text'),
    ('best_time_to_call', 'text')
$$;

-- SQL boolean expression over alias c for one criterion. Raises on anything
-- outside the whitelist. The expression is built from %I / %L only.
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
  _col := format('c.%I', _field);

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

create or replace function public.dialer_detail_reject(_field text, _op text)
returns text
language plpgsql
volatile
as $$
begin
  raise exception 'detail filter op % not allowed on %', _op, _field;
end;
$$;

-- AND of every criterion, as one SQL expression. Null for no criteria.
create or replace function public.dialer_detail_where(_filters jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  _parts text[];
begin
  if _filters is null or jsonb_typeof(_filters) = 'null' then
    return null;
  end if;
  if jsonb_typeof(_filters) <> 'array' then
    raise exception 'detail filters must be an array';
  end if;
  if jsonb_array_length(_filters) = 0 then
    return null;
  end if;
  if jsonb_array_length(_filters) > 25 then
    raise exception 'at most 25 detail filters';
  end if;
  select array_agg(public.dialer_detail_predicate(f) order by ord) into _parts
  from jsonb_array_elements(_filters) with ordinality as t(f, ord);
  return array_to_string(_parts, ' AND ');
end;
$$;

-- Ids of contacts matching every criterion. One scan of contacts; the queue
-- functions use it as `c.id IN (SELECT ...)`, which Postgres runs once and hashes.
create or replace function public.dialer_detail_filter_ids(_filters jsonb)
returns setof uuid
language plpgsql
stable
set search_path = public
as $$
declare
  _where text := public.dialer_detail_where(_filters);
begin
  if _where is null then
    return query select c.id from public.contacts c;
    return;
  end if;
  return query execute format('SELECT c.id FROM public.contacts c WHERE %s', _where);
end;
$$;

-- How many contacts have each whitelisted field set, in one scan. Shown next to
-- each filter so a rep doesn't pick something that empties the queue.
create or replace function public.get_contact_detail_coverage()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _sel text;
  _result jsonb;
begin
  select string_agg(
    format('%L, count(*) filter (where %s)', f.field,
      public.dialer_detail_predicate(jsonb_build_object('field', f.field, 'op', 'is_set'))),
    ', ')
  into _sel
  from public.dialer_detail_fields() f;
  execute format('SELECT jsonb_build_object(%L, count(*), %s) FROM public.contacts c', 'total', _sel)
  into _result;
  return _result;
end;
$$;

revoke all on function public.dialer_detail_fields() from public, anon, authenticated;
revoke all on function public.dialer_detail_predicate(jsonb) from public, anon, authenticated;
revoke all on function public.dialer_detail_reject(text, text) from public, anon, authenticated;
revoke all on function public.dialer_detail_where(jsonb) from public, anon, authenticated;
revoke all on function public.dialer_detail_filter_ids(jsonb) from public, anon, authenticated;
revoke all on function public.get_contact_detail_coverage() from public, anon;
grant execute on function public.get_contact_detail_coverage() to authenticated;

-- Patch the two queue cores in place: add the parameter, and one WHERE line just
-- before the lock check. The bodies are otherwise unchanged. Guards make sure the
-- anchors exist exactly once, so a drifted body fails loudly instead of half-patching.
do $patch$
declare
  _fn text;
  _old regprocedure;
  _def text;
  _sig_anchor text := '_mobile_gatekeeper text DEFAULT NULL::text)';
  _where_anchor text;
  _line text := E'AND (_detail_filters IS NULL OR c.id IN (SELECT public.dialer_detail_filter_ids(_detail_filters)))\n      ';
begin
  foreach _fn in array array['claim_dialer_leads_core', 'get_dialer_queue_count_core'] loop
    select p.oid::regprocedure into _old
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = _fn;
    _def := pg_get_functiondef(_old);
    if position('_detail_filters' in _def) > 0 then
      raise notice '% already has _detail_filters, skipping', _fn;
      continue;
    end if;
    _where_anchor := case _fn
      when 'claim_dialer_leads_core' then 'AND (l.contact_id IS NULL OR l.session_id = _session_id)'
      else 'AND (l.contact_id IS NULL OR l.session_id = _session_id OR l.user_id = _user_id)'
    end;
    if (length(_def) - length(replace(_def, _sig_anchor, ''))) / length(_sig_anchor) <> 1 then
      raise exception '%: signature anchor not found exactly once', _fn;
    end if;
    if (length(_def) - length(replace(_def, _where_anchor, ''))) / length(_where_anchor) <> 1 then
      raise exception '%: lock-check anchor not found exactly once', _fn;
    end if;
    _def := replace(_def, _sig_anchor, '_mobile_gatekeeper text DEFAULT NULL::text, _detail_filters jsonb DEFAULT NULL::jsonb)');
    _def := replace(_def, _where_anchor, _line || _where_anchor);
    execute format('drop function %s', _old);
    execute _def;
  end loop;
end
$patch$;

revoke all on function public.claim_dialer_leads_core(uuid,integer,integer,text[],text[],text[],text,text,text,numeric,integer,text,text,text,text,boolean,text,boolean,boolean,text[],text[],text,text[],text,text,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.get_dialer_queue_count_core(uuid,text[],text[],text[],text,text,text,numeric,integer,text,text,text,text,boolean,text,boolean,boolean,text[],text[],text,text[],text,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.claim_dialer_leads_core(uuid,integer,integer,text[],text[],text[],text,text,text,numeric,integer,text,text,text,text,boolean,text,boolean,boolean,text[],text[],text,text[],text,text,text,text,text,jsonb) to service_role;
grant execute on function public.get_dialer_queue_count_core(uuid,text[],text[],text[],text,text,text,numeric,integer,text,text,text,text,boolean,text,boolean,boolean,text[],text[],text,text[],text,text,text,text,text,jsonb) to service_role;

-- Wrappers: same allow-list logic as before, plus the new parameter.
drop function if exists public.claim_dialer_leads(uuid,integer,integer,text[],text[],text[],text,text,text,numeric,integer,text,text,text,text,boolean,text,boolean,boolean,text[],text[],text,text[],text,text,text,text,text);
drop function if exists public.get_dialer_queue_count(uuid,text[],text[],text[],text,text,text,numeric,integer,text,text,text,text,boolean,text,boolean,boolean,text[],text[],text,text[],text,text,text,text,text);

create function public.claim_dialer_leads(_session_id uuid, _claim_size integer DEFAULT 25, _lock_minutes integer DEFAULT 15, _industries text[] DEFAULT NULL::text[], _states text[] DEFAULT NULL::text[], _trade_types text[] DEFAULT NULL::text[], _work_type text DEFAULT NULL::text, _business_size text DEFAULT NULL::text, _prospect_tier text DEFAULT NULL::text, _min_gbp_rating numeric DEFAULT NULL::numeric, _min_review_count integer DEFAULT NULL::integer, _has_google_ads text DEFAULT NULL::text, _has_facebook_ads text DEFAULT NULL::text, _buying_signal_strength text DEFAULT NULL::text, _phone_type text DEFAULT NULL::text, _has_dm_phone boolean DEFAULT NULL::boolean, _contact_owner text DEFAULT NULL::text, _include_dnc boolean DEFAULT false, _include_disqualified boolean DEFAULT false, _dnc_reasons text[] DEFAULT NULL::text[], _dq_reasons text[] DEFAULT NULL::text[], _has_existing_agency text DEFAULT NULL::text, _existing_agency_services text[] DEFAULT NULL::text[], _lead_type text DEFAULT NULL::text, _lead_channel text DEFAULT NULL::text, _lead_source text DEFAULT NULL::text, _call_recency text DEFAULT NULL::text, _mobile_gatekeeper text DEFAULT NULL::text, _detail_filters jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _allowed text[];
  _eff text[] := _industries;
begin
  -- Manager-set training scope: a rep with an active restriction only ever
  -- gets leads from their allowed industries, whatever the client sends.
  select r.allowed_industries into _allowed
  from public.rep_dialer_restrictions r
  where r.user_id = auth.uid() and r.active and array_length(r.allowed_industries, 1) > 0;

  if _allowed is not null then
    if _eff is null then
      _eff := _allowed;
    else
      _eff := array(select unnest(_eff) intersect select unnest(_allowed));
      if array_length(_eff, 1) is null then _eff := _allowed; end if;
    end if;
  end if;

  -- Validate up front so a bad criterion is a clear error, not a planner one.
  perform public.dialer_detail_where(_detail_filters);
  if _detail_filters is not null and (jsonb_typeof(_detail_filters) <> 'array' or jsonb_array_length(_detail_filters) = 0) then
    _detail_filters := null;
  end if;

  return public.claim_dialer_leads_core(
    _session_id, _claim_size, _lock_minutes, _eff, _states, _trade_types, _work_type, _business_size,
    _prospect_tier, _min_gbp_rating, _min_review_count, _has_google_ads, _has_facebook_ads,
    _buying_signal_strength, _phone_type, _has_dm_phone, _contact_owner, _include_dnc, _include_disqualified,
    _dnc_reasons, _dq_reasons, _has_existing_agency, _existing_agency_services, _lead_type, _lead_channel,
    _lead_source, _call_recency, _mobile_gatekeeper, _detail_filters);
end $function$;

create function public.get_dialer_queue_count(_session_id uuid, _industries text[], _states text[], _trade_types text[], _work_type text, _business_size text, _prospect_tier text, _min_gbp_rating numeric, _min_review_count integer, _has_google_ads text, _has_facebook_ads text, _buying_signal_strength text, _phone_type text, _has_dm_phone boolean, _contact_owner text, _include_dnc boolean, _include_disqualified boolean, _dnc_reasons text[], _dq_reasons text[], _has_existing_agency text, _existing_agency_services text[], _lead_type text, _lead_channel text, _lead_source text, _call_recency text, _mobile_gatekeeper text, _detail_filters jsonb DEFAULT NULL::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _allowed text[];
  _eff text[] := _industries;
begin
  -- Same allow-list logic as claim_dialer_leads, so the count a rep sees
  -- matches what they can actually claim.
  select r.allowed_industries into _allowed
  from public.rep_dialer_restrictions r
  where r.user_id = auth.uid() and r.active and array_length(r.allowed_industries, 1) > 0;
  if _allowed is not null then
    if _eff is null then _eff := _allowed;
    else
      _eff := array(select unnest(_eff) intersect select unnest(_allowed));
      if array_length(_eff, 1) is null then _eff := _allowed; end if;
    end if;
  end if;

  perform public.dialer_detail_where(_detail_filters);
  if _detail_filters is not null and (jsonb_typeof(_detail_filters) <> 'array' or jsonb_array_length(_detail_filters) = 0) then
    _detail_filters := null;
  end if;

  return public.get_dialer_queue_count_core(
    _session_id, _eff, _states, _trade_types, _work_type, _business_size, _prospect_tier, _min_gbp_rating,
    _min_review_count, _has_google_ads, _has_facebook_ads, _buying_signal_strength, _phone_type, _has_dm_phone,
    _contact_owner, _include_dnc, _include_disqualified, _dnc_reasons, _dq_reasons, _has_existing_agency,
    _existing_agency_services, _lead_type, _lead_channel, _lead_source, _call_recency, _mobile_gatekeeper,
    _detail_filters);
end $function$;

grant execute on function public.claim_dialer_leads(uuid,integer,integer,text[],text[],text[],text,text,text,numeric,integer,text,text,text,text,boolean,text,boolean,boolean,text[],text[],text,text[],text,text,text,text,text,jsonb) to anon, authenticated, service_role;
grant execute on function public.get_dialer_queue_count(uuid,text[],text[],text[],text,text,text,numeric,integer,text,text,text,text,boolean,text,boolean,boolean,text[],text[],text,text[],text,text,text,text,text,jsonb) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
