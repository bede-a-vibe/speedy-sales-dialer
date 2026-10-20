-- With several reps dialling, each client held a 40-lead buffer (claims of 25, 15-minute locks
-- refreshed every 4 minutes), fencing off leads nobody was about to ring. The client now keeps
-- 8 (claims of 5, 10-minute locks) and the server caps live locks at 10 per rep regardless of
-- what the client asks for. Patched by text so the rest of claim_dialer_leads_core is untouched;
-- idempotent. Applied to prod 20 Oct 2026.
do $$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p join pg_namespace n2 on n2.oid=p.pronamespace where n2.nspname='public' and p.proname='claim_dialer_leads_core';
  if position('_max_live_locks' in src) > 0 then raise notice 'already applied'; return; end if;
  if position('DELETE FROM public.dialer_lead_locks WHERE expires_at <= now();' in src) = 0 then raise exception 'anchor not found'; end if;
  src := replace(src, 'DELETE FROM public.dialer_lead_locks WHERE expires_at <= now();',
    'DELETE FROM public.dialer_lead_locks WHERE expires_at <= now();
  -- A rep may hold at most _max_live_locks leads at once, whatever the client asks for, so a
  -- busy floor never has each rep fencing off a batch nobody is about to ring.
  SELECT COUNT(*) INTO _held FROM public.dialer_lead_locks WHERE user_id = _user_id AND expires_at > now();
  _normalized_claim_size := LEAST(_normalized_claim_size, GREATEST(0, _max_live_locks - _held));');
  src := replace(src, '_in_golden_window boolean := _current_hour IN (10, 13);',
    '_in_golden_window boolean := _current_hour IN (10, 13);
  _max_live_locks integer := 10;
  _held integer := 0;');
  if position('_held integer := 0;' in src) = 0 then raise exception 'declare anchor not found'; end if;
  execute src;
end $$;
