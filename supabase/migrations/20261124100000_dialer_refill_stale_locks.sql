-- Dialer "keeps refilling" (Ben, 24 Nov 2026).
--
-- 1. A lead logged while a refill was in flight was handed straight back to the rep:
--    the lock was released a moment before the status changed, so the claim took it
--    again. The client ignored it (already handled) but the lock sat for 10 minutes
--    and used one of the rep's 10 slots. Enough of those and every refill came back
--    empty. The claim now drops this rep's locks on finished leads before counting.
-- 2. Leads outside their calling window were served at the top, skipped, released and
--    served again. They now sort last, so a WA lead waits until WA opens.

create or replace function public.dialer_closed_states(_at timestamptz default now())
returns text[]
language sql
stable
set search_path to 'public'
as $$
  -- States outside their calling window, '' standing for an unknown state (Melbourne time).
  -- Mirrors src/lib/callingCompliance.ts: 9am-8pm Mon-Fri, 9am-5pm Sat, 30 min grace each
  -- side, no Sundays or public holidays.
  with z(st, tz) as (values
    ('NSW','Australia/Sydney'), ('ACT','Australia/Sydney'), ('VIC','Australia/Melbourne'),
    ('TAS','Australia/Hobart'), ('QLD','Australia/Brisbane'), ('SA','Australia/Adelaide'),
    ('WA','Australia/Perth'), ('NT','Australia/Darwin'), ('','Australia/Melbourne')
  ), l as (
    select st, (_at at time zone tz) as t from z
  ), p as (
    select st, t::date as d, extract(dow from t)::int as dow,
      (extract(hour from t) * 60 + extract(minute from t))::int as m
    from l
  )
  select coalesce(array_agg(st), '{}'::text[]) from p
  where dow = 0
    or m < 9 * 60 - 30
    or m >= (case when dow = 6 then 17 else 20 end) * 60 + 30
    or d = any (array['2026-12-25','2026-12-28']::date[])
$$;

do $mig$
declare
  _def text;
  _new text;
begin
  select pg_get_functiondef(p.oid) into _def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'claim_dialer_leads_core';
  if position('_closed_states' in _def) > 0 then return; end if;
  _new := _def;

  _new := replace(_new,
    $a$  _result jsonb;
BEGIN$a$,
    $a$  _closed_states text[] := public.dialer_closed_states();
  _result jsonb;
BEGIN$a$);

  _new := replace(_new,
    $a$  -- A rep may hold at most _max_live_locks leads at once$a$,
    $a$  -- Leads this rep has finished with do not count as held. A lead logged while a refill is
  -- in flight gets locked again (24 Nov 2026), and a few of those used up every slot.
  DELETE FROM public.dialer_lead_locks dl
  USING public.contacts fc
  WHERE dl.user_id = _user_id AND fc.id = dl.contact_id
    AND (fc.status <> 'uncalled' OR fc.is_archived IS TRUE OR fc.last_called_at > now() - interval '12 hours');
  -- A rep may hold at most _max_live_locks leads at once$a$);

  _new := replace(_new,
    $a$    SELECT c.id, c.call_attempt_count, c.created_at, l.session_id AS lock_session_id,$a$,
    $a$    SELECT c.id, c.call_attempt_count, c.created_at, l.session_id AS lock_session_id,
      ((CASE WHEN UPPER(TRIM(c.state)) IN ('NSW','ACT','VIC','TAS','QLD','SA','WA','NT') THEN UPPER(TRIM(c.state)) ELSE '' END) = ANY(_closed_states)) AS out_of_window,$a$);

  _new := replace(_new,
    $a$    ORDER BY vc.fresh_inbound_boost DESC,
      CASE$a$,
    $a$    ORDER BY vc.out_of_window ASC, vc.fresh_inbound_boost DESC,
      CASE$a$);

  _new := replace(_new,
    $a$    ORDER BY vc.never_dialled DESC, vc.ever_connected ASC,
      (c.lead_type$a$,
    $a$    ORDER BY vc.out_of_window ASC, vc.never_dialled DESC, vc.ever_connected ASC,
      (c.lead_type$a$);

  if (length(_new) - length(replace(_new, 'out_of_window', ''))) / length('out_of_window') <> 3
     or position('_closed_states text[]' in _new) = 0
     or position('Leads this rep has finished with' in _new) = 0 then
    raise exception 'claim_dialer_leads_core has changed, patch did not apply cleanly';
  end if;
  execute _new;
end
$mig$;

-- Filter counts skip archived leads, like the queue does.
do $mig$
declare _def text; _new text;
begin
  select pg_get_functiondef('public.get_dialer_filter_options'::regproc) into _def;
  if position('is_archived' in _def) > 0 then return; end if;
  _new := replace(_def, $a$WHERE status = 'uncalled' AND is_dnc$a$, $a$WHERE status = 'uncalled' AND is_archived IS NOT TRUE AND is_dnc$a$);
  execute _new;
end
$mig$;
