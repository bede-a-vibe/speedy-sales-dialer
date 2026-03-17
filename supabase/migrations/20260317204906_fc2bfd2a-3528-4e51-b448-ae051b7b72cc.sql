ALTER TABLE public.performance_targets DROP CONSTRAINT performance_targets_metric_key_check;

ALTER TABLE public.performance_targets ADD CONSTRAINT performance_targets_metric_key_check CHECK (metric_key = ANY (ARRAY[
  'bookings_made',
  'pickup_to_booking_rate',
  'dial_to_pickup_rate',
  'setter_show_up_rate',
  'setter_close_rate',
  'pickups',
  'dials',
  'setter_showed',
  'setter_closed_deals',
  'closer_meetings_booked',
  'closer_verbal_commitment_rate',
  'closer_close_rate',
  'closer_verbal_commitments',
  'closer_closed_deals',
  'show_up_rate',
  'closed_deals'
]::text[]));