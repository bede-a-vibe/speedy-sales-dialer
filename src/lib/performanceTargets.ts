import type { ReportMetrics } from "@/lib/reportMetrics";

export type PerformanceTargetScopeType = "individual" | "team";
export type PerformanceTargetPeriodType = "daily" | "weekly";

/**
 * Setter metrics chain:
 *   bookings_made → (÷ pickup_to_booking_rate) → pickups → (÷ dial_to_pickup_rate) → dials
 *   bookings_made → (× setter_show_up_rate) → setter_showed → (× setter_close_rate) → setter_closed_deals
 *
 * Closer metrics chain:
 *   closer_meetings_booked (input)
 *   closer_meetings_booked × closer_verbal_commitment_rate → closer_verbal_commitments
 *   closer_meetings_booked × closer_close_rate → closer_closed_deals
 */
export type PerformanceTargetMetricKey =
  // Setter inputs
  | "bookings_made"
  | "pickup_to_booking_rate"
  | "dial_to_pickup_rate"
  | "setter_show_up_rate"
  | "setter_close_rate"
  // Setter derived
  | "pickups"
  | "dials"
  | "setter_showed"
  | "setter_closed_deals"
  // Closer inputs
  | "closer_meetings_booked"
  | "closer_verbal_commitment_rate"
  | "closer_close_rate"
  // Closer derived
  | "closer_verbal_commitments"
  | "closer_closed_deals";

export type MetricGroup = "setter" | "closer";

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
  // Setter
  bookings_made: number;
  pickup_to_booking_rate: number;
  dial_to_pickup_rate: number;
  setter_show_up_rate: number;
  setter_close_rate: number;
  pickups: number;
  dials: number;
  setter_showed: number;
  setter_closed_deals: number;
  // Closer
  closer_meetings_booked: number;
  closer_verbal_commitment_rate: number;
  closer_close_rate: number;
  closer_verbal_commitments: number;
  closer_closed_deals: number;
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

export interface MetricDefinition {
  label: string;
  description: string;
  isRate: boolean;
  isDerived: boolean;
  group: MetricGroup;
}

export const PERFORMANCE_TARGET_METRIC_DEFINITIONS: Record<PerformanceTargetMetricKey, MetricDefinition> = {
  // Setter inputs
  bookings_made: {
    label: "Bookings Made",
    description: "Setter-created bookings",
    isRate: false,
    isDerived: false,
    group: "setter",
  },
  pickup_to_booking_rate: {
    label: "Pickup → Booking %",
    description: "Bookings made / pickups",
    isRate: true,
    isDerived: false,
    group: "setter",
  },
  dial_to_pickup_rate: {
    label: "Dial → Pickup %",
    description: "Pickups / dials (phone number health)",
    isRate: true,
    isDerived: false,
    group: "setter",
  },
  setter_show_up_rate: {
    label: "Show-Up Rate",
    description: "% of booked meetings that show up",
    isRate: true,
    isDerived: false,
    group: "setter",
  },
  setter_close_rate: {
    label: "Close Rate",
    description: "% of showed meetings that close",
    isRate: true,
    isDerived: false,
    group: "setter",
  },
  // Setter derived
  pickups: {
    label: "Pickups",
    description: "Auto: bookings ÷ pickup-to-booking %",
    isRate: false,
    isDerived: true,
    group: "setter",
  },
  dials: {
    label: "Dials",
    description: "Auto: pickups ÷ dial-to-pickup %",
    isRate: false,
    isDerived: true,
    group: "setter",
  },
  setter_showed: {
    label: "Showed",
    description: "Auto: bookings × show-up rate",
    isRate: false,
    isDerived: true,
    group: "setter",
  },
  setter_closed_deals: {
    label: "Closed Deals",
    description: "Auto: showed × close rate",
    isRate: false,
    isDerived: true,
    group: "setter",
  },
  // Closer inputs
  closer_meetings_booked: {
    label: "Meetings Booked",
    description: "Appointments assigned to closer",
    isRate: false,
    isDerived: false,
    group: "closer",
  },
  closer_verbal_commitment_rate: {
    label: "Verbal Commitment %",
    description: "% of meetings with verbal commitment",
    isRate: true,
    isDerived: false,
    group: "closer",
  },
  closer_close_rate: {
    label: "Close Rate",
    description: "% of meetings closed (payment on call)",
    isRate: true,
    isDerived: false,
    group: "closer",
  },
  // Closer derived
  closer_verbal_commitments: {
    label: "Verbal Commitments",
    description: "Auto: meetings × verbal commitment %",
    isRate: false,
    isDerived: true,
    group: "closer",
  },
  closer_closed_deals: {
    label: "Closed Deals",
    description: "Auto: meetings × close rate",
    isRate: false,
    isDerived: true,
    group: "closer",
  },
};

/** All metric keys */
export const PERFORMANCE_TARGET_METRICS = Object.keys(
  PERFORMANCE_TARGET_METRIC_DEFINITIONS,
) as PerformanceTargetMetricKey[];

/** Setter metrics in display order */
export const SETTER_METRICS = PERFORMANCE_TARGET_METRICS.filter(
  (k) => PERFORMANCE_TARGET_METRIC_DEFINITIONS[k].group === "setter",
);

/** Closer metrics in display order */
export const CLOSER_METRICS = PERFORMANCE_TARGET_METRICS.filter(
  (k) => PERFORMANCE_TARGET_METRIC_DEFINITIONS[k].group === "closer",
);

/** Only the metrics an admin manually enters */
export const INPUT_METRICS = PERFORMANCE_TARGET_METRICS.filter(
  (k) => !PERFORMANCE_TARGET_METRIC_DEFINITIONS[k].isDerived,
);

export const SETTER_INPUT_METRICS = INPUT_METRICS.filter(
  (k) => PERFORMANCE_TARGET_METRIC_DEFINITIONS[k].group === "setter",
);

export const CLOSER_INPUT_METRICS = INPUT_METRICS.filter(
  (k) => PERFORMANCE_TARGET_METRIC_DEFINITIONS[k].group === "closer",
);

export function formatTargetMetricValue(metricKey: PerformanceTargetMetricKey, value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  if (PERFORMANCE_TARGET_METRIC_DEFINITIONS[metricKey].isRate) {
    return `${Math.round(value)}%`;
  }
  // Show 1 decimal place for non-whole numbers, whole numbers stay clean
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
}

// ── Derivation logic ──────────────────────────────────────────────

export interface SetterDerivedValues {
  pickups: number;
  dials: number;
  setter_showed: number;
  setter_closed_deals: number;
}

export function deriveSetterValues(inputs: {
  bookings_made?: number;
  pickup_to_booking_rate?: number;
  dial_to_pickup_rate?: number;
  setter_show_up_rate?: number;
  setter_close_rate?: number;
}): SetterDerivedValues {
  const bookings = inputs.bookings_made ?? 0;
  const pickupToBooking = inputs.pickup_to_booking_rate ?? 0;
  const dialToPickup = inputs.dial_to_pickup_rate ?? 0;
  const showUpRate = inputs.setter_show_up_rate ?? 0;
  const closeRate = inputs.setter_close_rate ?? 0;

  const pickups = pickupToBooking > 0 ? bookings / (pickupToBooking / 100) : 0;
  const dials = dialToPickup > 0 ? pickups / (dialToPickup / 100) : 0;
  const showed = showUpRate > 0 ? bookings * (showUpRate / 100) : 0;
  const closedDeals = closeRate > 0 ? showed * (closeRate / 100) : 0;

  return { pickups, dials, setter_showed: showed, setter_closed_deals: closedDeals };
}

export interface CloserDerivedValues {
  closer_verbal_commitments: number;
  closer_closed_deals: number;
}

export function deriveCloserValues(inputs: {
  closer_meetings_booked?: number;
  closer_verbal_commitment_rate?: number;
  closer_close_rate?: number;
}): CloserDerivedValues {
  const meetings = inputs.closer_meetings_booked ?? 0;
  const verbalRate = inputs.closer_verbal_commitment_rate ?? 0;
  const closeRate = inputs.closer_close_rate ?? 0;

  return {
    closer_verbal_commitments: verbalRate > 0 ? meetings * (verbalRate / 100) : 0,
    closer_closed_deals: closeRate > 0 ? meetings * (closeRate / 100) : 0,
  };
}

/**
 * Given stored input targets for one user, produce the full set
 * including derived setter and closer values.
 */
function addDerivedTargets(inputTargets: PerformanceTargetRecord[]): PerformanceTargetRecord[] {
  const byMetric = new Map(inputTargets.map((t) => [t.metric_key, Number(t.target_value)]));
  const template = inputTargets[0];
  if (!template) return inputTargets;

  // Setter derivation
  const setterDerived = deriveSetterValues({
    bookings_made: byMetric.get("bookings_made"),
    pickup_to_booking_rate: byMetric.get("pickup_to_booking_rate"),
    dial_to_pickup_rate: byMetric.get("dial_to_pickup_rate"),
    setter_show_up_rate: byMetric.get("setter_show_up_rate"),
    setter_close_rate: byMetric.get("setter_close_rate"),
  });

  // Closer derivation
  const closerDerived = deriveCloserValues({
    closer_meetings_booked: byMetric.get("closer_meetings_booked"),
    closer_verbal_commitment_rate: byMetric.get("closer_verbal_commitment_rate"),
    closer_close_rate: byMetric.get("closer_close_rate"),
  });

  const allDerived = { ...setterDerived, ...closerDerived } as Record<string, number>;
  const derivedRecords: PerformanceTargetRecord[] = [];

  for (const [key, value] of Object.entries(allDerived)) {
    if (value > 0) {
      derivedRecords.push({
        id: `derived-${key}-${template.user_id}-${template.period_type}`,
        scope_type: template.scope_type,
        period_type: template.period_type,
        metric_key: key as PerformanceTargetMetricKey,
        user_id: template.user_id,
        target_value: value,
        created_at: "",
        updated_at: "",
      });
    }
  }

  return [...inputTargets, ...derivedRecords];
}

// ── Actual metrics mapping ──────────────────────────────────────────

export function getPerformanceActualMetrics(metrics: ReportMetrics): PerformanceActualMetrics {
  return {
    // Setter
    bookings_made: metrics.bookingsMade.totalBookingsMade,
    pickup_to_booking_rate: metrics.bookingsMade.pickUpsToBookingRate,
    dial_to_pickup_rate: metrics.dialer.pickUpRate,
    setter_show_up_rate: metrics.appointmentPerformance.setter.showUpRate,
    setter_close_rate: metrics.appointmentPerformance.setter.closeRate,
    pickups: metrics.dialer.pickUps,
    dials: metrics.dialer.dials,
    setter_showed: metrics.appointmentPerformance.setter.showed,
    setter_closed_deals: metrics.appointmentPerformance.setter.showedClosed,
    // Closer
    closer_meetings_booked: metrics.appointmentPerformance.closer.appointmentsScheduled,
    closer_verbal_commitment_rate: metrics.appointmentPerformance.closer.verbalCommitmentRate,
    closer_close_rate: metrics.appointmentPerformance.closer.closeRate,
    closer_verbal_commitments: metrics.appointmentPerformance.closer.showedVerbalCommitment,
    closer_closed_deals: metrics.appointmentPerformance.closer.showedClosed,
  };
}

// ── Target progress items builder ──────────────────────────────────

export function buildTargetProgressItems(
  targets: PerformanceTargetRecord[],
  actualMetrics: PerformanceActualMetrics,
  filterGroup?: MetricGroup,
): TargetProgressItem[] {
  const targetMap = new Map(targets.map((target) => [target.metric_key, Number(target.target_value)]));
  const metricsToShow = filterGroup
    ? PERFORMANCE_TARGET_METRICS.filter((k) => PERFORMANCE_TARGET_METRIC_DEFINITIONS[k].group === filterGroup)
    : PERFORMANCE_TARGET_METRICS;

  return metricsToShow.map((metricKey) => {
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

// ── Roll-up and derivation ──────────────────────────────────────────

export const WEEKLY_MULTIPLIER = 5;

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

export function deriveAllTargets(storedTargets: PerformanceTargetRecord[]) {
  const storedDaily = storedTargets.filter(
    (t) => t.scope_type === "individual" && t.period_type === "daily",
  );

  // Group by user, add derived targets per user, then flatten
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

// ── Period helpers ──────────────────────────────────────────

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
