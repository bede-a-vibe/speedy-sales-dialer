import type { ReportMetrics } from "@/lib/reportMetrics";

export type PerformanceTargetScopeType = "individual" | "team";
export type PerformanceTargetPeriodType = "daily" | "weekly";
export type PerformanceTargetMetricKey = "dials" | "pickups" | "pickup_to_booking_rate" | "bookings_made" | "show_up_rate" | "closed_deals";

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
  { label: string; description: string; isRate: boolean }
> = {
  dials: {
    label: "Dials",
    description: "Total calls made",
    isRate: false,
  },
  pickups: {
    label: "Pickups",
    description: "Answered calls (excl. no answer/voicemail)",
    isRate: false,
  },
  pickup_to_booking_rate: {
    label: "Pickup → Booking %",
    description: "Bookings made / pickups",
    isRate: true,
  },
  bookings_made: {
    label: "Bookings Made",
    description: "Setter-created bookings",
    isRate: false,
  },
  show_up_rate: {
    label: "Show-Up Rate",
    description: "Setter show-ups / appointments set",
    isRate: true,
  },
  closed_deals: {
    label: "Closed Deals",
    description: "Closer showed-closed outcomes",
    isRate: false,
  },
};

export const PERFORMANCE_TARGET_METRICS = Object.keys(
  PERFORMANCE_TARGET_METRIC_DEFINITIONS,
) as PerformanceTargetMetricKey[];

export function formatTargetMetricValue(metricKey: PerformanceTargetMetricKey, value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";

  const normalizedValue = PERFORMANCE_TARGET_METRIC_DEFINITIONS[metricKey].isRate
    ? Math.round(value)
    : Math.round(value);

  return PERFORMANCE_TARGET_METRIC_DEFINITIONS[metricKey].isRate
    ? `${normalizedValue}%`
    : normalizedValue.toLocaleString();
}

export function getPerformanceActualMetrics(metrics: ReportMetrics): PerformanceActualMetrics {
  return {
    dials: metrics.dialer.dials,
    pickups: metrics.dialer.pickUps,
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

export function buildRolledUpIndividualTargets(
  targets: PerformanceTargetRecord[],
  periodType: PerformanceTargetPeriodType,
): PerformanceTargetRecord[] {
  const relevantTargets = targets.filter(
    (target) => target.scope_type === "individual" && target.period_type === periodType,
  );

  return PERFORMANCE_TARGET_METRICS.flatMap((metricKey) => {
    const metricTargets = relevantTargets.filter((target) => target.metric_key === metricKey);
    if (metricTargets.length === 0) return [];

    const totalValue = PERFORMANCE_TARGET_METRIC_DEFINITIONS[metricKey].isRate
      ? metricTargets.reduce((sum, target) => sum + Number(target.target_value), 0) / metricTargets.length
      : metricTargets.reduce((sum, target) => sum + Number(target.target_value), 0);

    return [
      {
        id: `rollup-${periodType}-${metricKey}`,
        scope_type: "team" as const,
        period_type: periodType,
        metric_key: metricKey,
        user_id: null,
        target_value: totalValue,
        created_at: "",
        updated_at: "",
      },
    ];
  });
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
