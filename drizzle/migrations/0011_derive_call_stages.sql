CREATE OR REPLACE FUNCTION public.derive_call_stages() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE p int; s int; c int;
BEGIN
  p := NULLIF(NEW.scorecard->'nepq_scores'->>'problem_awareness','')::int;
  s := NULLIF(NEW.scorecard->'nepq_scores'->>'solution_awareness','')::int;
  c := NULLIF(NEW.scorecard->'nepq_scores'->>'commitment','')::int;
  NEW.stage_problem_solution := CASE WHEN p IS NULL OR p < 3 THEN NULL ELSE COALESCE(s,0) >= 3 END;
  NEW.stage_solution_commit := CASE WHEN s IS NULL OR s < 3 THEN NULL ELSE COALESCE(c,0) >= 3 END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_derive_call_stages ON public.call_scores;
CREATE TRIGGER trg_derive_call_stages BEFORE INSERT OR UPDATE OF scorecard ON public.call_scores FOR EACH ROW EXECUTE FUNCTION public.derive_call_stages();
UPDATE public.call_scores SET scorecard = scorecard;