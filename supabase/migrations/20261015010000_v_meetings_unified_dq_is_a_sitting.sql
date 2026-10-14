-- A disqualification is a sitting, not a failed slot.
--
-- PR #125 fixed this in reportMetrics (the Custom Monitor / funnel path) but
-- not in v_meetings_unified, which feeds the Sources page via
-- get_source_funnel, the Meetings page and get_rep_meeting_stats. The two
-- halves of the app then disagreed by exactly the number of disqualified
-- meetings: for 14 Sep - 14 Oct 2026 the Cold Call row read 33 showed / 34%
-- while the Custom Monitor read 36 showed / 37% over the same 97 meetings.
--
-- The earlier migration 20261012010000 deliberately moved 'disqualified' OUT
-- of 'showed' because the view had been counting genuinely cancelled meetings
-- as shows. That fixed the cancelled half and overshot on the DQ half: a
-- prospect who turned up, took the meeting and was judged not qualified did
-- attend. Bede's definition (12 Oct) has a slot resolve four ways - showed,
-- no-show, cancelled, rescheduled - and disqualified is none of them; it is a
-- verdict on a slot that showed.
--
-- Checked before status='canceled' because a DQ'd row can carry that status
-- and the outcome is the truth about attendance. Mirrors bucketOf() in
-- src/lib/reportMetrics.ts - change the two together or they drift again.

DO $$
DECLARE d text; d0 text;
BEGIN
  SELECT pg_get_viewdef('public.v_meetings_unified'::regclass, true) INTO d;
  d0 := d;

  d := replace(d,
    'WHEN pi.status = ''canceled''::pipeline_status THEN ''cancelled''::text',
    'WHEN pi.appointment_outcome = ''disqualified''::appointment_outcome THEN ''showed''::text
            WHEN pi.status = ''canceled''::pipeline_status THEN ''cancelled''::text');

  d := replace(d,
    'WHEN pi.appointment_outcome = ANY (ARRAY[''cancelled''::appointment_outcome, ''disqualified''::appointment_outcome]) THEN ''cancelled''::text',
    'WHEN pi.appointment_outcome = ''cancelled''::appointment_outcome THEN ''cancelled''::text');

  -- Already applied (the branch is present): nothing to do.
  IF position('disqualified''::appointment_outcome THEN ''showed' in d0) > 0 THEN
    RAISE NOTICE 'v_meetings_unified already treats disqualified as showed; skipping.';
    RETURN;
  END IF;

  IF d = d0 THEN
    RAISE EXCEPTION 'v_meetings_unified did not match the expected text - resolve by hand rather than guessing';
  END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.v_meetings_unified AS ' || d;
END $$;
