/**
 * Team KPI targets: role defaults (setter / closer) with per-person overrides.
 * All count targets are DAILY; weekly = ×5, monthly = ×18.6 (PRODUCTIVE_DAYS_PER_MONTH).
 * Rates are percentages. Stored in kpi_settings under key "team_targets".
 */
export type TargetKey =
  | "dialsPerDay" | "hoursPerDay" | "pickupRate" | "convRate" | "problemRate" | "solutionRate"
  | "commitRate" | "bookingsPerDay" | "bookingsPerPickup" | "qualifiedRate" | "showRate"
  | "qualifiedShowRate" | "closeRate";

export type Targets = Record<TargetKey, number | null>;
export type RoleKey = "setter" | "closer";

export interface TeamTargetsConfig {
  roles: Record<RoleKey, Partial<Targets>>;
  userRole: Record<string, RoleKey>;
  users: Record<string, Partial<Targets>>;
}

export const TARGET_FIELDS: { key: TargetKey; label: string; unit: "" | "%"; kind: "count" | "rate" }[] = [
  { key: "dialsPerDay", label: "Dials / day", unit: "", kind: "count" },
  { key: "hoursPerDay", label: "Productive hrs / day", unit: "", kind: "count" },
  { key: "pickupRate", label: "Pick-up rate", unit: "%", kind: "rate" },
  { key: "convRate", label: "Pick-up → conversation", unit: "%", kind: "rate" },
  { key: "problemRate", label: "Conversation → problem", unit: "%", kind: "rate" },
  { key: "solutionRate", label: "Problem → solution", unit: "%", kind: "rate" },
  { key: "commitRate", label: "Solution → commitment", unit: "%", kind: "rate" },
  { key: "bookingsPerDay", label: "Meetings set / day", unit: "", kind: "count" },
  { key: "bookingsPerPickup", label: "Bookings per pick-up", unit: "%", kind: "rate" },
  { key: "qualifiedRate", label: "Qualified bookings", unit: "%", kind: "rate" },
  { key: "showRate", label: "Show rate", unit: "%", kind: "rate" },
  { key: "qualifiedShowRate", label: "Qualified show rate", unit: "%", kind: "rate" },
  { key: "closeRate", label: "Close rate", unit: "%", kind: "rate" },
];

const EMPTY = Object.fromEntries(TARGET_FIELDS.map((f) => [f.key, null])) as Targets;

export const DEFAULT_CONFIG: TeamTargetsConfig = {
  roles: {
    setter: { dialsPerDay: 375, hoursPerDay: 7.5, pickupRate: 30, convRate: 68, problemRate: 36, solutionRate: 50, commitRate: 80, bookingsPerDay: 6.75, bookingsPerPickup: 6, qualifiedRate: 85, showRate: 40, qualifiedShowRate: 50, closeRate: 25 },
    closer: { showRate: 40, qualifiedShowRate: 50, closeRate: 25, qualifiedRate: 85 },
  },
  userRole: {},
  users: {},
};

export function targetsFor(cfg: TeamTargetsConfig, userId: string): { role: RoleKey; t: Targets } {
  const role = cfg.userRole[userId] ?? "setter";
  const t = { ...EMPTY, ...(cfg.roles[role] ?? {}) } as Targets;
  for (const [k, v] of Object.entries(cfg.users[userId] ?? {})) if (v != null) (t as any)[k] = v;
  return { role, t };
}
