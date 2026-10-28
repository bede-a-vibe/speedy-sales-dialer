-- Inbound Dialpad calls are not dials (Bede, 28 Oct 2026).
--
-- The Dialpad catch-up sweep auto-logged every unlinked call as a "no answer"
-- dial, callbacks included: a prospect ringing back after a missed dial became a
-- second dial, bumped call_attempt_count and last_called_at, and inflated every
-- dial count (Ben: 319 phantom dials since 27 Sep). Its time-window linker also
-- let the callback steal the rep's outbound log, orphaning the outbound row,
-- which then got auto-logged as a third row.
--
-- 1. Guard trigger: refuse auto-logged rows that describe an inbound call, and
--    auto-logged rows that duplicate a log the rep already wrote for that dial.
-- 2. get_rep_eod_metrics counted dialpad_calls rows of any direction as dials.
-- 3. Back up and remove the phantom rows already created.

create or replace function public.skip_phantom_autolog()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.notes is null or new.notes not like 'Auto-logged%' then
    return new;
  end if;

  -- An inbound call is never a dial. The sweep inserts with created_at =
  -- dialpad_calls.started_at and patches dialpad_call_id afterwards, so match on
  -- either key.
  if exists (
    select 1 from public.dialpad_calls d
     where d.direction = 'inbound'
       and ((new.dialpad_call_id is not null and d.dialpad_call_id = new.dialpad_call_id)
         or (d.contact_id = new.contact_id and d.started_at = new.created_at))
  ) then
    return null;
  end if;

  -- The rep already logged this dial by hand within ten minutes: the sweep is
  -- only re-logging an outbound row whose log was stolen by a callback.
  if exists (
    select 1 from public.call_logs cl
     where cl.contact_id = new.contact_id
       and cl.user_id = new.user_id
       and (cl.notes is null or cl.notes not like 'Auto-logged%')
       and cl.created_at between new.created_at - interval '10 minutes'
                             and new.created_at + interval '10 minutes'
  ) then
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists call_logs_skip_phantom_autolog on public.call_logs;
create trigger call_logs_skip_phantom_autolog
  before insert on public.call_logs
  for each row execute function public.skip_phantom_autolog();

-- 2. EOD dials: outbound Dialpad rows only.
do $$
declare
  src text;
  needle text := E'from dialpad_calls\n   where user_id = _user_id';
  n int;
begin
  src := pg_get_functiondef('public.get_rep_eod_metrics'::regproc);
  n := (length(src) - length(replace(src, needle, ''))) / length(needle);
  if n <> 1 then
    raise exception 'get_rep_eod_metrics: expected 1 dials block, found %', n;
  end if;
  src := replace(src, needle, needle || E'\n     and coalesce(direction, ''outbound'') = ''outbound''');
  execute src;
end $$;

-- 3. Back up, then remove, the phantom rows.
create table if not exists public.call_logs_removed_phantom (
  like public.call_logs including defaults,
  removed_at timestamptz not null default now(),
  removed_reason text not null
);
alter table public.call_logs_removed_phantom enable row level security;

with inbound_junk as (
  select cl.id
    from public.call_logs cl
    join public.dialpad_calls d on d.dialpad_call_id = cl.dialpad_call_id
   where d.direction = 'inbound'
     and cl.notes like 'Auto-logged%'
),
twin_junk as (
  select a.id
    from public.call_logs a
    join public.dialpad_calls d on d.dialpad_call_id = a.dialpad_call_id
   where coalesce(d.direction, 'outbound') = 'outbound'
     and a.notes like 'Auto-logged%'
     and exists (
       select 1 from public.call_logs o
        where o.contact_id = a.contact_id
          and o.user_id = a.user_id
          and o.id <> a.id
          and (o.notes is null or o.notes not like 'Auto-logged%')
          and o.created_at between a.created_at - interval '10 minutes'
                               and a.created_at + interval '10 minutes'
     )
),
backed as (
  insert into public.call_logs_removed_phantom
  select cl.*, now(), case when cl.id in (select id from inbound_junk)
                           then 'inbound Dialpad call auto-logged as a dial'
                           else 'auto-logged twin of a dial the rep already logged' end
    from public.call_logs cl
   where cl.id in (select id from inbound_junk union select id from twin_junk)
  returning id
)
delete from public.call_logs where id in (select id from backed);
