CREATE TABLE public.call_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_log_id uuid NOT NULL REFERENCES public.call_logs(id) ON DELETE CASCADE,
  rep_user_id uuid NOT NULL,
  reviewer_id uuid NOT NULL DEFAULT auth.uid(),
  score smallint NOT NULL CHECK (score BETWEEN 1 AND 5),
  went_well text,
  improve text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (call_log_id)
);
CREATE INDEX call_reviews_rep_idx ON public.call_reviews (rep_user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_reviews TO authenticated;
GRANT ALL ON public.call_reviews TO service_role;
ALTER TABLE public.call_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers manage reviews" ON public.call_reviews FOR ALL TO authenticated
  USING (public.is_admin_or_coach(auth.uid())) WITH CHECK (public.is_admin_or_coach(auth.uid()) AND reviewer_id = auth.uid());
CREATE POLICY "Reps read own reviews" ON public.call_reviews FOR SELECT TO authenticated
  USING (rep_user_id = auth.uid());
CREATE TRIGGER call_reviews_updated BEFORE UPDATE ON public.call_reviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.manager_one_on_ones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_user_id uuid NOT NULL,
  manager_id uuid NOT NULL DEFAULT auth.uid(),
  meeting_date date NOT NULL DEFAULT current_date,
  notes text,
  action_items text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX manager_one_on_ones_rep_idx ON public.manager_one_on_ones (rep_user_id, meeting_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manager_one_on_ones TO authenticated;
GRANT ALL ON public.manager_one_on_ones TO service_role;
ALTER TABLE public.manager_one_on_ones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers manage 1:1s" ON public.manager_one_on_ones FOR ALL TO authenticated
  USING (public.is_admin_or_coach(auth.uid())) WITH CHECK (public.is_admin_or_coach(auth.uid()) AND manager_id = auth.uid());
CREATE TRIGGER manager_one_on_ones_updated BEFORE UPDATE ON public.manager_one_on_ones FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();