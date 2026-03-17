CREATE TABLE public.performance_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type TEXT NOT NULL,
  period_type TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  user_id UUID NULL,
  target_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT performance_targets_scope_type_check CHECK (scope_type IN ('individual', 'team')),
  CONSTRAINT performance_targets_period_type_check CHECK (period_type IN ('daily', 'weekly')),
  CONSTRAINT performance_targets_metric_key_check CHECK (metric_key IN ('bookings_made', 'show_up_rate', 'closed_deals')),
  CONSTRAINT performance_targets_target_value_check CHECK (target_value >= 0),
  CONSTRAINT performance_targets_user_scope_check CHECK (
    (scope_type = 'team' AND user_id IS NULL) OR
    (scope_type = 'individual' AND user_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX performance_targets_team_unique_idx
  ON public.performance_targets (period_type, metric_key)
  WHERE scope_type = 'team';

CREATE UNIQUE INDEX performance_targets_individual_unique_idx
  ON public.performance_targets (user_id, period_type, metric_key)
  WHERE scope_type = 'individual';

CREATE INDEX performance_targets_scope_period_idx
  ON public.performance_targets (scope_type, period_type, metric_key);

CREATE INDEX performance_targets_user_period_idx
  ON public.performance_targets (user_id, period_type)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.performance_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view performance targets"
ON public.performance_targets
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage performance targets"
ON public.performance_targets
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_performance_targets_updated_at
BEFORE UPDATE ON public.performance_targets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();