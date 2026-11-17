import { Input } from "@/components/ui/input";
import { TEAM_SIZE_BANDS } from "@/data/constants";
import {
  BOOKING_METHODS,
  BOOKING_TIER_LABELS,
  DEFAULT_BOOKING_METHOD,
  tierFor,
  type BookingMethod,
  type BookingTier,
} from "@/lib/appointments";
import { cn } from "@/lib/utils";

/**
 * What the setter captures when booking a meeting, for the Funnel Tracker's
 * tier and booking-method splits: team size on the tools (including the owner),
 * monthly revenue, the tier (auto from tierFor, overridable) and how the
 * meeting was booked.
 */
export interface BookingQualifier {
  teamSize: string;
  monthlyRevenue: string;
  /** null = use the automatic tier. */
  tierOverride: BookingTier | "unknown" | null;
  method: BookingMethod;
}

type ContactLike = { team_size?: number | null; monthly_revenue?: number | null } | null | undefined;

export function qualifierFromContact(contact: ContactLike): BookingQualifier {
  return {
    teamSize: contact?.team_size != null ? String(contact.team_size) : "",
    monthlyRevenue: contact?.monthly_revenue != null ? String(Number(contact.monthly_revenue)) : "",
    tierOverride: null,
    method: DEFAULT_BOOKING_METHOD,
  };
}

const parseNumber = (v: string) => {
  const t = v.replace(/[$,\s]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function resolveQualifier(q: BookingQualifier) {
  const teamSize = parseNumber(q.teamSize);
  const monthlyRevenue = parseNumber(q.monthlyRevenue);
  const autoTier = tierFor(teamSize == null ? null : Math.round(teamSize), monthlyRevenue);
  const tier: BookingTier | null = q.tierOverride === null ? autoTier : q.tierOverride === "unknown" ? null : q.tierOverride;
  return {
    teamSize: teamSize == null ? null : Math.round(teamSize),
    monthlyRevenue,
    autoTier,
    tier,
    tierSource: (q.tierOverride === null ? "auto" : "setter") as "auto" | "setter",
    method: q.method,
  };
}

/** Pipeline item fields for a new booking. */
export function qualifierBookingFields(q: BookingQualifier) {
  const r = resolveQualifier(q);
  return { booking_tier: r.tier, booking_tier_source: r.tierSource, booking_method: r.method };
}

/**
 * Contact fields to save, only for values the setter entered or changed. The
 * team size also sets the business-size band the dialer filters on.
 */
export function qualifierContactUpdate(q: BookingQualifier, contact: ContactLike) {
  const r = resolveQualifier(q);
  const now = new Date().toISOString();
  const out: Record<string, unknown> = {};
  if (r.teamSize !== null && r.teamSize !== (contact?.team_size ?? null)) {
    out.team_size = r.teamSize;
    out.team_size_source = "setter";
    out.team_size_set_at = now;
    out.team_size_evidence = null;
    out.business_size = r.teamSize >= 3 ? TEAM_SIZE_BANDS.team : TEAM_SIZE_BANDS.small;
  }
  const currentRevenue = contact?.monthly_revenue == null ? null : Number(contact.monthly_revenue);
  if (r.monthlyRevenue !== null && r.monthlyRevenue !== currentRevenue) {
    out.monthly_revenue = r.monthlyRevenue;
    out.monthly_revenue_source = "setter";
    out.monthly_revenue_set_at = now;
    out.monthly_revenue_evidence = null;
  }
  return out;
}

export function BookingTierBadge({ tier, className }: { tier: string | null | undefined; className?: string }) {
  if (tier !== "tier_1" && tier !== "tier_2") return null;
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        tier === "tier_1"
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300",
        className,
      )}
    >
      {BOOKING_TIER_LABELS[tier]}
    </span>
  );
}

const TIER_CHOICES: { value: BookingTier | "unknown"; label: string }[] = [
  { value: "tier_1", label: "Tier 1" },
  { value: "tier_2", label: "Tier 2" },
  { value: "unknown", label: "Unknown" },
];

export function BookingQualifierFields({ value, onChange }: { value: BookingQualifier; onChange: (next: BookingQualifier) => void }) {
  const r = resolveQualifier(value);
  const effective: BookingTier | "unknown" = r.tier ?? "unknown";
  const labelClass = "mb-2 block text-[10px] uppercase tracking-widest text-muted-foreground";
  return (
    <div className="space-y-3 rounded-md border border-border bg-background/60 p-3" data-testid="booking-qualifier">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="booking-team-size" className={labelClass}>Team size on the tools (incl. owner)</label>
          <Input
            id="booking-team-size"
            type="number"
            min={0}
            inputMode="numeric"
            value={value.teamSize}
            onChange={(e) => onChange({ ...value, teamSize: e.target.value })}
            placeholder="e.g. 4"
            className="border-border bg-background"
          />
        </div>
        <div>
          <label htmlFor="booking-monthly-revenue" className={labelClass}>Monthly revenue $</label>
          <Input
            id="booking-monthly-revenue"
            type="number"
            min={0}
            inputMode="numeric"
            value={value.monthlyRevenue}
            onChange={(e) => onChange({ ...value, monthlyRevenue: e.target.value })}
            placeholder="e.g. 60000"
            className="border-border bg-background"
          />
        </div>
      </div>
      <div>
        <span className={labelClass}>
          Tier {value.tierOverride === null ? "(auto)" : "(set by you)"}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-border bg-background p-0.5 text-xs" role="group" aria-label="Booking tier">
            {TIER_CHOICES.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-pressed={effective === c.value}
                onClick={() => onChange({ ...value, tierOverride: c.value === (r.autoTier ?? "unknown") ? null : c.value })}
                className={cn(
                  "rounded-sm px-2.5 py-1 transition-colors",
                  effective === c.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground">Tier 1 = 3+ on the tools and $50k+ a month</span>
        </div>
      </div>
      <div>
        <span className={labelClass}>Booking method</span>
        <div className="flex flex-wrap rounded-md border border-border bg-background p-0.5 text-xs" role="group" aria-label="Booking method">
          {BOOKING_METHODS.map((m) => (
            <button
              key={m.value}
              type="button"
              aria-pressed={value.method === m.value}
              onClick={() => onChange({ ...value, method: m.value })}
              className={cn(
                "rounded-sm px-2.5 py-1 transition-colors",
                value.method === m.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
