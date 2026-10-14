-- ─────────────────────────────────────────────────────────────────────────
-- One rule for how a booked slot resolved.
--
-- It used to exist six times: a CASE in v_meetings_unified, bucketOf() in
-- src/lib/reportMetrics.ts, a SHOWED set copied into KpiScorecard,
-- KpiPeriodTargets and TeamKpis, another in CloseTrackingPanel, and one more
-- in mergeMeetingStreams. They drifted — a disqualification was a sitting in
-- one half of the app and a cancellation in the other, so the same 97 cold-call
-- meetings read 36 showed on the Custom Monitor and 33 on the Sources page.
--
-- Now: this function decides, v_meetings_unified calls it, and the app reads
-- it through a PostgREST computed column. Nothing re-derives it.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.resolve_meeting_bucket(
  _outcome appointment_outcome,
  _status pipeline_status,
  _scheduled_for timestamptz
) RETURNS text
LANGUAGE sql
STABLE                        -- reads now() for the upcoming/pending split
SET search_path TO 'public'
AS $$
  SELECT CASE
    -- A disqualification is a sitting with a verdict: they turned up and were
    -- judged not qualified. Checked FIRST because a DQ'd row can also carry
    -- status = 'canceled', and the outcome is the truth about attendance.
    WHEN _outcome = 'disqualified'  THEN 'showed'
    WHEN _status  = 'canceled'      THEN 'cancelled'
    WHEN _outcome = 'no_show'       THEN 'noshow'
    WHEN _outcome = 'rescheduled'   THEN 'rescheduled'
    WHEN _outcome = 'cancelled'     THEN 'cancelled'
    WHEN _outcome IS NOT NULL       THEN 'showed'
    WHEN _scheduled_for >= now()    THEN 'upcoming'
    ELSE 'pending'
  END;
$$;

COMMENT ON FUNCTION public.resolve_meeting_bucket IS
  'Single source of truth for how a booked slot resolved: showed / noshow / cancelled / rescheduled / upcoming / pending. Consumed by v_meetings_unified and, through the resolved_bucket computed column, by every funnel and KPI surface. Do not re-implement this rule anywhere else.';

-- PostgREST computed column: select("resolved_bucket") straight off
-- pipeline_items. Beats a view here because the app's queries rely on the
-- contacts FK embed and on pipeline_items RLS, both of which this preserves.
CREATE OR REPLACE FUNCTION public.resolved_bucket(public.pipeline_items)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT public.resolve_meeting_bucket($1.appointment_outcome, $1.status, $1.scheduled_for);
$$;

COMMENT ON FUNCTION public.resolved_bucket(public.pipeline_items) IS
  'PostgREST computed column over resolve_meeting_bucket(). select("resolved_bucket") on pipeline_items.';

GRANT EXECUTE ON FUNCTION public.resolve_meeting_bucket(appointment_outcome, pipeline_status, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolved_bucket(public.pipeline_items) TO authenticated;

-- Point the unified view's dialer branch at the function instead of its own
-- inline CASE. Patched rather than retyped so the other 40-odd columns cannot
-- be transcribed wrongly; refuses to guess if the text is not what we expect.
DO $$
DECLARE d text; d0 text;
BEGIN
  SELECT pg_get_viewdef('public.v_meetings_unified'::regclass, true) INTO d;
  d0 := d;

  IF position('resolve_meeting_bucket(pi.appointment_outcome' in d) > 0 THEN
    RAISE NOTICE 'v_meetings_unified already calls resolve_meeting_bucket; skipping.';
    RETURN;
  END IF;

  d := regexp_replace(
    d,
    'CASE\s+WHEN pi\.appointment_outcome = ''disqualified''.*?ELSE ''pending''::text\s+END AS resolved_outcome',
    'resolve_meeting_bucket(pi.appointment_outcome, pi.status, pi.scheduled_for) AS resolved_outcome'
  );

  IF d = d0 THEN
    RAISE EXCEPTION 'the dialer CASE in v_meetings_unified did not match the expected text - resolve by hand rather than guessing';
  END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.v_meetings_unified AS ' || d;
END $$;

-- Truth table. Fails the migration rather than shipping a wrong rule.
DO $$
DECLARE bad int;
BEGIN
  SELECT count(*) INTO bad FROM (VALUES
    ('disqualified','completed', now() - interval '1 day', 'showed'),
    ('disqualified','canceled',  now() - interval '1 day', 'showed'),
    ('cancelled',   'canceled',  now() - interval '1 day', 'cancelled'),
    (NULL,          'canceled',  now() - interval '1 day', 'cancelled'),
    ('no_show',     'completed', now() - interval '1 day', 'noshow'),
    ('rescheduled', 'open',      now() - interval '1 day', 'rescheduled'),
    ('showed_closed','completed',now() - interval '1 day', 'showed'),
    ('showed_no_close','completed', now() - interval '1 day','showed'),
    ('showed_verbal_commitment','completed', now() - interval '1 day','showed'),
    ('second_meeting_booked','completed', now() - interval '1 day','showed'),
    ('no_close_follow_up','completed', now() - interval '1 day','showed'),
    (NULL,          'open',      now() - interval '1 day', 'pending'),
    (NULL,          'open',      now() + interval '1 day', 'upcoming')
  ) AS t(oc, st, sched, expected)
  WHERE public.resolve_meeting_bucket(t.oc::appointment_outcome, t.st::pipeline_status, t.sched) IS DISTINCT FROM t.expected;

  IF bad > 0 THEN
    RAISE EXCEPTION 'resolve_meeting_bucket failed % of its truth-table cases', bad;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
