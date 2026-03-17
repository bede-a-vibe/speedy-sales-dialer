import type { ReportMetrics } from "@/lib/reportMetrics";

export type PerformanceTargetScopeType = "individual" | "team";
export type PerformanceTargetPeriodType = "daily" | "weekly";
export type PerformanceTargetMetricKey =
  | "bookings_made"
  | "pickup_to_booking_rate"
  | "dial_to_pickup_rate"
  | "pickups"
  | "dials"
  | "show_up_rate"
  | "closed_deals";

export interface PerformanceTargetRecord {
  id: string;
  scope_type: PerformanceTargetScopeType;
  period_type: PerformanceTargetPeriodType;
  metric_key: PerformanceTargetMetricKey;
  user_id: string | null;
  target_value: number;
  created_at: string;
  updated_at: string;
}

export interface PerformanceActualMetrics {
  dials: number;
  pickups: number;
  dial_to_pickup_rate: number;
  pickup_to_booking_rate: number;
  bookings_made: number;
  show_up_rate: number;
  closed_deals: number;
}

export interface TargetProgressItem {
  key: PerformanceTargetMetricKey;
  label: string;
  description: string;
  isRate: boolean;
  actualValue: number;
  targetValue: number | null;
  progress: number;
  hasTarget: boolean;
  formattedActual: string;
  formattedTarget: string;
}

export const PERFORMANCE_TARGET_SCOPE_LABELS: Record<PerformanceTargetScopeType, string> = {
  individual: "Individual",
  team: "Team",
};

export const PERFORMANCE_TARGET_PERIOD_LABELS: Record<PerformanceTargetPeriodType, string> = {
  daily: "Daily",
  weekly: "Weekly",
};

export const PERFORMANCE_TARGET_METRIC_DEFINITIONS: Record<
  PerformanceTargetMetricKey,
  { label: string; description: string; isRate: boolean; isDerived: boolean }
> = {
  bookings_made: {
    label: "Bookings Made",
    description: "Setter-created bookings",
    isRate: false,
    isDerived: false,
  },
  pickup_to_booking_rate: {
    label: "Pickup → Booking %",
    description: "Bookings made / pickups",
    isRate: true,
    isDerived: false,
  },
  dial_to_pickup_rate: {
    label: "Dial → Pickup %",
    description: "Pickups / dials (phone number health)",
    isRate: true,
    isDerived: false,
  },
  pickups: {
    label: "Pickups",
    description: "Auto: bookings ÷ pickup-to-booking rate",
    isRate: false,
    isDerived: true,
  },
  dials: {
    label: "Dials",
    description: "Auto: pickups ÷ dial-to-pickup rate",
    isRate: false,
    isDerived: true,
  },
  show_up_rate: {
    label: "Show-Up Rate",
    description: "Setter show-ups / appointments set",
    isRate: true,
    isDerived: false,
  },
  closed_deals: {
    label: "Closed Deals",
    description: "Closer showed-closed outcomes",
    isRate: false,
    isDerived: false,
  },
};

/** All metric keys in display order */
export const PERFORMANCE_TARGET_METRICS = Object.keys(
  PERFORMANCE_TARGET_METRIC_DEFINITIONS,
) as PerformanceTargetMetricKey[];

/** Only the metrics an admin manually enters */
export const INPUT_METRICS = PERFORMANCE_TARGET_METRICS.filter(
  (k) => !PERFORMANCE_TARGET_METRIC_DEFINITIONS[k].isDerived,
);

/** Metrics that are auto-calculated from inputs */
export const DERIVED_METRICS = PERFORMANCE_TARGET_METRICS.filter(
  (k) => PERFORMANCE_TARGET_METRIC_DEFINITIONS[k].isDerived,
);

export function formatTargetMetricValue(metricKey: PerformanceTargetMetricKey, value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";

  const rounded = Math.round(value);
  return PERFORMANCE_TARGET_METRIC_DEFINITIONS[metricKey].isRate
    ? `${rounded}%`
    : rounded.toLocaleString();
}

/**
 * From bookings + rates, derive the required pickups and dials.
 *   pickups = bookings / (pickup_to_booking_rate / 100)
 *   dials   = pickups / (dial_to_pickup_rate / 100)
 */
export function deriveDialsAndPickups(inputs: {
  bookings_made?: number;
  pickup_to_booking_rate?: number;
  dial_to_pickup_rate?: number;
}): { pickups: number; dials: number } {
  const bookings = inputs.bookings_made ?? 0;
  const pickupToBooking = inputs.pickup_to_booking_rate ?? 0;
  const dialToPickup = inputs.dial_to_pickup_rate ?? 0;

  const pickups = pickupToBooking > 0 ? Math.ceil(bookings / (pickupToBooking / 100)) : 0;
  const dials = dialToPickup > 0 ? Math.ceil(pickups / (dialToPickup / 100)) : 0;

  return { pickups, dials };
}

/**
 * Given stored input targets for a user/scope, produce the full set
 * including derived pickups and dials.
 */
function addDerivedTargets(inputTargets: PerformanceTargetRecord[]): PerformanceTargetRecord[] {
  const byMetric = new Map(inputTargets.map((t) => [t.metric_key, t]));
  const bookingsTarget = byMetric.get("bookings_made");
  const pickupRateTarget = byMetric.get("pickup_to_booking_rate");
  const dialRateTarget = byMetric.get("dial_to_pickup_rate");

  const { pickups, dials } = deriveDialsAndPickups({
    bookings_made: bookingsTarget ? Number(bookingsTarget.target_value) : undefined,
    pickup_to_booking_rate: pickupRateTarget ? Number(pickupRateTarget.target_value) : undefined,
    dial_to_pickup_rate: dialRateTarget ? Number(dialRateTarget.target_value) : undefined,
  });

  const template = inputTargets[0];
  if (!template) return inputTargets;

  const derivedRecords: PerformanceTargetRecord[] = [];

  if (pickups > 0) {
    derivedRecords.push({
      id: `derived-pickups-${template.user_id}-${template.period_type}`,
      scope_type: template.scope_type,
      period_type: template.period_type,
      metric_key: "pickups",
      user_id: template.user_id,
      target_value: pickups,
      created_at: "",
      updated_at: "",
    });
  }

  if (dials > 0) {
    derivedRecords.push({
      id: `derived-dials-${template.user_id}-${template.period_type}`,
      scope_type: template.scope_type,
      period_type: template.period_type,
      metric_key: "dials",
      user_id: template.user_id,
      target_value: dials,
      created_at: "",
      updated_at: "",
    });
  }

  return [...inputTargets, ...derivedRecords];
}

export function getPerformanceActualMetrics(metrics: ReportMetrics): PerformanceActualMetrics {
  return {
    dials: metrics.dialer.dials,
    pickups: metrics.dialer.pickUps,
    dial_to_pickup_rate: metrics.dialer.pickUpRate,
    pickup_to_booking_rate: metrics.bookingsMade.pickUpsToBookingRate,
    bookings_made: metrics.bookingsMade.totalBookingsMade,
    show_up_rate: metrics.appointmentPerformance.setter.showUpRate,
    closed_deals: metrics.appointmentPerformance.closer.showedClosed,
  };
}

export function buildTargetProgressItems(
  targets: PerformanceTargetRecord[],
  actualMetrics: PerformanceActualMetrics,
): TargetProgressItem[] {
  const targetMap = new Map(targets.map((target) => [target.metric_key, Number(target.target_value)]));

  return PERFORMANCE_TARGET_METRICS.map((metricKey) => {
    const definition = PERFORMANCE_TARGET_METRIC_DEFINITIONS[metricKey];
    const actualValue = actualMetrics[metricKey];
    const targetValue = targetMap.get(metricKey) ?? null;
    const hasTarget = targetValue !== null;
    const progress = hasTarget && targetValue > 0 ? Math.min((actualValue / targetValue) * 100, 100) : 0;

    return {
      key: metricKey,
      label: definition.label,
      description: definition.description,
      isRate: definition.isRate,
      actualValue,
      targetValue,
      progress,
      hasTarget,
      formattedActual: formatTargetMetricValue(metricKey, actualValue),
      formattedTarget: formatTargetMetricValue(metricKey, targetValue),
    };
  });
}

const WEEKLY_MULTIPLIER = 5;

/**
 * Derive weekly targets from daily targets.
 * Count metrics are multiplied by 5 (work days). Rate metrics stay the same.
 */
export function deriveWeeklyTargets(
  dailyTargets: PerformanceTargetRecord[],
): PerformanceTargetRecord[] {
  return dailyTargets.map((target) => ({
    ...target,
    id: `derived-weekly-${target.id}`,
    period_type: "weekly" as const,
    target_value: PERFORMANCE_TARGET_METRIC_DEFINITIONS[target.metric_key].isRate
      ? target.target_value
      : target.target_value * WEEKLY_MULTIPLIER,
  }));
}

/**
 * Roll up individual targets into team targets.
 * Count metrics are summed. Rate metrics are averaged.
 */
export function rollUpToTeamTargets(
  individualTargets: PerformanceTargetRecord[],
): PerformanceTargetRecord[] {
  return PERFORMANCE_TARGET_METRICS.flatMap((metricKey) => {
    const metricTargets = individualTargets.filter((t) => t.metric_key === metricKey);
    if (metricTargets.length === 0) return [];

    const isRate = PERFORMANCE_TARGET_METRIC_DEFINITIONS[metricKey].isRate;
    const totalValue = isRate
      ? metricTargets.reduce((sum, t) => sum + Number(t.target_value), 0) / metricTargets.length
      : metricTargets.reduce((sum, t) => sum + Number(t.target_value), 0);

    return [
      {
        id: `rollup-${metricTargets[0].period_type}-${metricKey}`,
        scope_type: "team" as const,
        period_type: metricTargets[0].period_type,
        metric_key: metricKey,
        user_id: null,
        target_value: totalValue,
        created_at: "",
        updated_at: "",
      },
    ];
  });
}

/**
 * From individual daily targets stored in the DB, derive all 4 target sets
 * including auto-calculated dials & pickups:
 * - individual daily (stored inputs + derived dials/pickups)
 * - individual weekly (daily × 5 for counts, same for rates)
 * - team daily (sum counts, average rates)
 * - team weekly (team daily × 5 for counts, same for rates)
 */
export function deriveAllTargets(storedTargets: PerformanceTargetRecord[]) {
  const storedDaily = storedTargets.filter(
    (t) => t.scope_type === "individual" && t.period_type === "daily",
  );

  // Group by user, add derived dials/pickups per user, then flatten
  const byUser = new Map<string, PerformanceTargetRecord[]>();
  for (const t of storedDaily) {
    if (!t.user_id) continue;
    const list = byUser.get(t.user_id) || [];
    list.push(t);
    byUser.set(t.user_id, list);
  }

  const individualDaily = Array.from(byUser.values()).flatMap(addDerivedTargets);
  const individualWeekly = deriveWeeklyTargets(individualDaily);
  const teamDaily = rollUpToTeamTargets(individualDaily);
  const teamWeekly = rollUpToTeamTargets(individualWeekly);

  return { individualDaily, individualWeekly, teamDaily, teamWeekly };
}

/** @deprecated Use rollUpToTeamTargets instead */
export function buildRolledUpIndividualTargets(
  targets: PerformanceTargetRecord[],
  periodType: PerformanceTargetPeriodType,
): PerformanceTargetRecord[] {
  const relevantTargets = targets.filter(
    (target) => target.scope_type === "individual" && target.period_type === periodType,
  );
  return rollUpToTeamTargets(relevantTargets);
}

export function getTargetPeriodForDateRange(
  from?: string,
  to?: string,
): PerformanceTargetPeriodType {
  return from && to && from === to ? "daily" : "weekly";
}

export function getTargetPeriodDescription(periodType: PerformanceTargetPeriodType) {
  return periodType === "daily"
    ? "Using daily goals because the report is scoped to a single day."
    : "Using weekly goals because the report spans multiple days.";
}

export { WEEKLY_MULTIPLIER };
