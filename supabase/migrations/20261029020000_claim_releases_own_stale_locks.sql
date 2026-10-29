-- A rep's own stale locks must not count against the per-rep lock cap (29 Oct 2026).
--
-- 20261020040000 capped each rep at 10 live locks, counted across ALL of that rep's
-- sessions. The client releases locks on pagehide, but that request is fire-and-forget
-- and a reload mid-session drops it, so the old session's 10 locks sat live for the full
-- lock window. Bede reloaded at 16:58, started again, and the claim was capped to zero:
-- "0 leads ready", "No more leads in queue", with 17,962 cold mobile leads in the pool.
--
-- A rep dials from one session at a time, so locks under any other session id of the
-- same user are dead weight: hand them back before counting what is held. The count
-- function likewise ignores locks held by the same user, so the number a rep sees
-- before starting matches what the claim can give them.
do $$
declare
  src text; n int;
  needle text := E'  DELETE FROM public.dialer_lead_locks WHERE expires_at <= now();\n  -- A rep may hold at most _max_live_locks';
  repl text := E'  DELETE FROM public.dialer_lead_locks WHERE expires_at <= now();\n  -- A rep dials from one session at a time. Locks left behind by this rep''s earlier session\n  -- (a reload or a closed tab mid-session; 29 Oct 2026: ten dead locks capped Bede''s new\n  -- session to zero leads) are dead weight, so hand them back before counting what is held.\n  DELETE FROM public.dialer_lead_locks WHERE user_id = _user_id AND session_id IS DISTINCT FROM _session_id;\n  -- A rep may hold at most _max_live_locks';
  needle2 text := 'AND (l.contact_id IS NULL OR l.session_id = _session_id);';
  repl2 text := 'AND (l.contact_id IS NULL OR l.session_id = _session_id OR l.user_id = _user_id);';
begin
  src := pg_get_functiondef('public.claim_dialer_leads_core'::regproc);
  if position('session_id IS DISTINCT FROM _session_id' in src) > 0 then raise notice 'claim already patched';
  else
    n := (length(src) - length(replace(src, needle, ''))) / length(needle);
    if n <> 1 then raise exception 'claim_dialer_leads_core: expected 1 cap block, found %', n; end if;
    execute replace(src, needle, repl);
  end if;
  src := pg_get_functiondef('public.get_dialer_queue_count_core'::regproc);
  if position('OR l.user_id = _user_id' in src) > 0 then raise notice 'count already patched';
  else
    n := (length(src) - length(replace(src, needle2, ''))) / length(needle2);
    if n <> 1 then raise exception 'get_dialer_queue_count_core: expected 1 lock clause, found %', n; end if;
    execute replace(src, needle2, repl2);
  end if;
end $$;
