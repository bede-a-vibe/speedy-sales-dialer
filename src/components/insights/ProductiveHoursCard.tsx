import { useMemo, useState } from "react";
import { Clock, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  computeProductiveHours,
  formatHours,
  DEFAULT_IDLE_CUTOFF_MINUTES,
  IDLE_CUTOFF_OPTIONS,
  TARGET_BOOKINGS_PER_PRODUCTIVE_HOUR,
  TARGET_PRODUCTIVE_HOURS_PER_DAY,
  type CallLogLike,
} from "@/lib/productiveHours";
import { cn } from "@/lib/utils";

interface Props {
  callLogs: CallLogLike[];
  /** Bookings made in the same window — drives books-per-productive-hour. */
  bookings: number;
  activeRepId?: string;
  selectedRepLabel?: string;
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-mono text-xl font-bold tabular-nums",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
          tone === "bad" && "text-destructive",
          !tone && "text-foreground",
        )}
      >
        {value}
      </p>
      {sub ? <p className="text-[10px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

/**
 * Productive dialling hours — the contractual KPI from the setter package.
 *
 * The idle cutoff is a visible control rather than a hidden constant because
 * the number genuinely depends on it (4x+ swing on real data). A KPI you can
 * hold someone to has to state its own rule.
 */
export function ProductiveHoursCard({ callLogs, bookings, activeRepId, selectedRepLabel }: Props) {
  const [cutoff, setCutoff] = useState<number>(DEFAULT_IDLE_CUTOFF_MINUTES);

  const r = useMemo(
    () => computeProductiveHours(callLogs, { idleCutoffMinutes: cutoff, repUserId: activeRepId, bookings }),
    [callLogs, cutoff, activeRepId, bookings],
  );

  const hrsTone =
    r.hoursPerActiveDay === null
      ? undefined
      : r.hoursPerActiveDay >= TARGET_PRODUCTIVE_HOURS_PER_DAY
        ? "good"
        : r.hoursPerActiveDay < TARGET_PRODUCTIVE_HOURS_PER_DAY * 0.67
          ? "bad"
          : undefined;

  const bphTone =
    r.bookingsPerProductiveHour === null
      ? undefined
      : r.bookingsPerProductiveHour >= TARGET_BOOKINGS_PER_PRODUCTIVE_HOUR
        ? "good"
        : r.bookingsPerProductiveHour < TARGET_BOOKINGS_PER_PRODUCTIVE_HOUR * 0.67
          ? "bad"
          : undefined;

  const soloShare = r.dials > 0 ? r.soloDials / r.dials : 0;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Productive dialling hours</h3>
            {selectedRepLabel ? (
              <span className="text-xs text-muted-foreground">{selectedRepLabel}</span>
            ) : (
              <span className="text-xs text-muted-foreground">team</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              idle cutoff
            </span>
            <div className="flex rounded-md border border-border p-0.5">
              {IDLE_CUTOFF_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setCutoff(m)}
                  className={cn(
                    "rounded px-1.5 py-0.5 font-mono text-xs transition-colors",
                    cutoff === m
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Productive" value={formatHours(r.productiveHours)} sub={`${r.activeDays} active days`} />
          <Stat
            label="Per day"
            value={formatHours(r.hoursPerActiveDay)}
            sub={`target ${TARGET_PRODUCTIVE_HOURS_PER_DAY}h`}
            tone={hrsTone}
          />
          <Stat
            label="Books / hr"
            value={r.bookingsPerProductiveHour === null ? "—" : r.bookingsPerProductiveHour.toFixed(2)}
            sub={`target ${TARGET_BOOKINGS_PER_PRODUCTIVE_HOUR.toFixed(2)}`}
            tone={bphTone}
          />
          <Stat
            label="Dials / hr"
            value={r.dialsPerProductiveHour === null ? "—" : r.dialsPerProductiveHour.toFixed(0)}
          />
          <Stat label="Sessions" value={r.sessions.toLocaleString()} sub={`${r.dials.toLocaleString()} dials`} />
          <Stat
            label="Bursts / day"
            value={r.activeDays > 0 ? (r.sessions / r.activeDays).toFixed(1) : "—"}
          />
        </div>

        {/* The rule is part of the number, so it is stated rather than assumed. */}
        <div className="mt-3 flex gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            A <span className="text-foreground">session</span> is a run of calls with no gap longer than{" "}
            <span className="text-foreground">{cutoff} minutes</span>; productive time is the sum of each
            session's first-to-last span. The figure moves more than 4x across cutoff choices, so the cutoff is
            part of the metric — change it above and the numbers move with it.
            {soloShare > 0.05 ? (
              <>
                {" "}
                <span className="text-foreground">
                  {r.soloDials.toLocaleString()} dials ({Math.round(soloShare * 100)}%) sit in single-call
                  sessions
                </span>{" "}
                and so add a dial but no measurable time — which pushes dials/hr up and productive hours down.
              </>
            ) : null}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
