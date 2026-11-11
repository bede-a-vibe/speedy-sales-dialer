-- Captured-detail filters: every field the dialer's Capture details panel
-- captures (Decision Maker, Intelligence and Marketing tabs) is now filterable.
-- Adds budget, authority, timeline, ABN, website, agency name/notes, key quote,
-- agreed next steps, gatekeeper name/notes, best route to DM, DM role, phone
-- type, email and LinkedIn to the whitelist (see 20261111040000).
--
-- get_contact_detail_coverage is rebuilt in chunks: jsonb_build_object takes at
-- most 100 arguments, and the list is now past 50 fields.

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
    ('best_route_to_decision_maker', 'text')
$$;

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
  -- One jsonb_build_object per 40 fields, joined with ||, all in one scan.
  select string_agg(chunk, ' || ')
  into _sel
  from (
    select format('jsonb_build_object(%s)', string_agg(
      format('%L, count(*) filter (where %s)', f.field,
        public.dialer_detail_predicate(jsonb_build_object('field', f.field, 'op', 'is_set'))),
      ', ' order by f.n)) as chunk
    from (select d.field, row_number() over () as n from public.dialer_detail_fields() d) f
    group by (f.n - 1) / 40
  ) chunks;
  execute format('SELECT jsonb_build_object(%L, count(*)) || %s FROM public.contacts c', 'total', _sel)
  into _result;
  return _result;
end;
$$;

revoke all on function public.get_contact_detail_coverage() from public, anon;
grant execute on function public.get_contact_detail_coverage() to authenticated;

notify pgrst, 'reload schema';
