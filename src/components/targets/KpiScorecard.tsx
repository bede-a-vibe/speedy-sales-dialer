import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Gauge } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  DIAGNOSTICS, PRODUCTIVE_IDLE_CUTOFF_MIN, bandStatus, productiveHours, rampForTenure, type DiagKey,
} from "@/lib/kpiStandards";

const ANSWERED = new Set(["booked", "not_interested", "follow_up", "dnc", "gatekeeper"]);
const SHOWED = new Set(["showed_closed", "showed_no_close", "showed_verbal_commitment", "second_meeting_booked", "no_close_follow_up"]);

function localDayKey(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function useScorecardData(days: number) {
  return useQuery({
    queryKey: ["kpi-scorecard", days],
    staleTime: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const logs: any[] = [];
      for (let page = 0; ; page++) {
        const { data, error } = await supabase
          .from("call_logs")
          .select("user_id, outcome, dialpad_talk_time_seconds, created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: true })
          .range(page * 1000, page * 1000 + 999);
        if (error) throw error;
        logs.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      const [profiles, appts] = await Promise.all([
        supabase.from("profiles").select("user_id, display_name, email, created_at, is_active"),
        supabase.from("pipeline_items").select("created_by, appointment_outcome, scheduled_for")
          .eq("pipeline_type", "booked").gte("scheduled_for", since).lte("scheduled_for", new Date().toISOString()),
      ]);
      if (profiles.error) throw profiles.error;
      if (appts.error) throw appts.error;
      return { logs, profiles: profiles.data ?? [], appts: appts.data ?? [] };
    },
  });
}

interface RepRow {
  userId: string; name: string; tenureDay: number; bandLabel: string;
  activeDays: number; hoursPerDay: number; hoursTarget: number;
  booksPerHour: number | null; booksTarget: number | null; minToPass: number | null;
  setsPerDay: number; setsTarget: number | null;
  showRate: number | null; showTarget: number | null;
  diag: Partial<Record<DiagKey, number | null>>;
}

const fmt = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d));

function Cell({ value, target, digits = 2, suffix = "", floor }: { value: number | null; target: number | null; digits?: number; suffix?: string; floor?: number | null }) {
  const bad = value != null && floor != null ? value < floor : value != null && target != null && value < target;
  const good = value != null && target != null && value >= target;
  return (
    <td className="py-2 pr-3 font-mono tabular-nums text-xs">
      <span className={cn(good && "text-[hsl(var(--outcome-booked))] font-semibold", bad && "text-destructive font-semibold")}>
        {fmt(value, digits)}{value != null ? suffix : ""}
      </span>
      <span className="text-muted-foreground"> / {target == null ? "—" : `${target}${suffix}`}</span>
    </td>
  );
}

/**
 * Per-rep scorecard vs tenure-based ramp targets plus the diagnostic alert
 * bands. Productive hours use the locked 15-minute idle cutoff.
 */
export function KpiScorecard({ userId }: { userId?: string }) {
  const [days, setDays] = useState(7);
  const { data, isLoading } = useScorecardData(days);

  const rows = useMemo<RepRow[]>(() => {
    if (!data) return [];
    const byUser = new Map<string, any[]>();
    for (const l of data.logs) {
      if (!l.user_id || (userId && l.user_id !== userId)) continue;
      (byUser.get(l.user_id) ?? byUser.set(l.user_id, []).get(l.user_id)!).push(l);
    }
    const out: RepRow[] = [];
    for (const [uid, logs] of byUser) {
      const p = data.profiles.find((x: any) => x.user_id === uid);
      const { band, day } = rampForTenure(p?.created_at);
      const perDay = new Map<string, number[]>();
      let pickups = 0, conv = 0, bookings = 0;
      for (const l of logs) {
        const t = new Date(l.created_at).getTime();
        const k = localDayKey(t);
        (perDay.get(k) ?? perDay.set(k, []).get(k)!).push(t);
        if (ANSWERED.has(l.outcome)) pickups++;
        if ((l.dialpad_talk_time_seconds ?? 0) > 15) conv++;
        if (l.outcome === "booked") bookings++;
      }
      let hours = 0;
      for (const ts of perDay.values()) hours += productiveHours(ts);
      const activeDays = perDay.size || 1;
      const mine = data.appts.filter((a: any) => a.created_by === uid && a.appointment_outcome);
      const showed = mine.filter((a: any) => SHOWED.has(a.appointment_outcome)).length;
      const decided = mine.filter((a: any) => a.appointment_outcome !== "rescheduled").length;
      out.push({
        userId: uid,
        name: p?.display_name || p?.email?.split("@")[0] || "Unknown",
        tenureDay: day, bandLabel: band.label, activeDays,
        hoursPerDay: hours / activeDays, hoursTarget: band.hoursPerDay,
        booksPerHour: hours > 0.25 ? bookings / hours : null, booksTarget: band.booksPerHour, minToPass: band.minToPass,
        setsPerDay: bookings / activeDays, setsTarget: band.setsPerDay,
        showRate: decided > 0 ? (100 * showed) / decided : null, showTarget: band.showRate,
        diag: {
          dials_per_hour: hours > 0.25 ? logs.length / hours : null,
          pickup_rate: logs.length ? (100 * pickups) / logs.length : null,
          pickup_to_conversation: pickups ? Math.min(100, (100 * conv) / pickups) : null,
          bookings_per_pickup: pickups ? (100 * bookings) / pickups : null,
        },
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [data, userId]);

  const alerts = rows.flatMap((r) =>
    (Object.entries(r.diag) as [DiagKey, number | null][])
      .map(([k, v]) => ({ r, k, v, s: bandStatus(k, v) }))
      .filter((x) => x.s === "low" || x.s === "high"),
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-5 w-5 text-primary" /> KPI scorecard
            </CardTitle>
            <CardDescription>
              Actual vs ramp target for each rep's tenure. Productive hours locked to a {PRODUCTIVE_IDLE_CUTOFF_MIN}-minute idle cutoff.
            </CardDescription>
          </div>
          <div className="flex gap-1">
            {[7, 30].map((d) => (
              <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>
                {d} days
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No dialling in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-1.5 pr-3 font-medium">Rep</th>
                  <th className="pb-1.5 pr-3 font-medium">Stage</th>
                  <th className="pb-1.5 pr-3 font-medium">Prod hrs/day</th>
                  <th className="pb-1.5 pr-3 font-medium">Books/prod hr</th>
                  <th className="pb-1.5 pr-3 font-medium">Sets/day</th>
                  <th className="pb-1.5 pr-3 font-medium">Show rate</th>
                  <th className="pb-1.5 font-medium">Pass?</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pass = r.minToPass == null || r.booksPerHour == null ? null : r.booksPerHour >= r.minToPass;
                  return (
                    <tr key={r.userId} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-3 font-medium">{r.name}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{r.bandLabel} <span className="font-mono">(d{r.tenureDay})</span></td>
                      <Cell value={r.hoursPerDay} target={r.hoursTarget} digits={1} />
                      <Cell value={r.booksPerHour} target={r.booksTarget} floor={r.minToPass} />
                      <Cell value={r.setsPerDay} target={r.setsTarget} digits={1} />
                      <Cell value={r.showRate} target={r.showTarget} digits={0} suffix="%" />
                      <td className="py-2 text-xs">
                        {pass == null ? <span className="text-muted-foreground">—</span>
                          : pass ? <span className="text-[hsl(var(--outcome-booked))] font-semibold">Yes</span>
                          : <span className="text-destructive font-semibold">Below {r.minToPass}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="mb-2 text-[10px] font-mono uppercase tracking-widest text-primary">Diagnostics — alert bands</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-1.5 pr-3 font-medium">Metric</th>
                  <th className="pb-1.5 pr-3 font-medium">Target</th>
                  <th className="pb-1.5 pr-3 font-medium">Alert if</th>
                  {rows.map((r) => <th key={r.userId} className="pb-1.5 pr-3 font-medium">{r.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {DIAGNOSTICS.map((d) => (
                  <tr key={d.key} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5 pr-3">{d.label}<span className="block text-[10px] text-muted-foreground">{d.note}</span></td>
                    <td className="py-1.5 pr-3 font-mono">{d.target}{d.unit}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground">
                      {d.above != null ? `>${d.above} or ` : ""}&lt;{d.below}{d.unit}
                    </td>
                    {rows.map((r) => {
                      const v = r.diag[d.key] ?? null;
                      const s = bandStatus(d.key, v);
                      return (
                        <td key={r.userId} className={cn("py-1.5 pr-3 font-mono tabular-nums",
                          (s === "low" || s === "high") && "text-destructive font-semibold",
                          s === "ok" && "text-foreground")}>
                          {v == null ? <span className="text-muted-foreground">n/a</span> : `${v.toFixed(d.unit === "/hr" ? 0 : 1)}${d.unit}`}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Funnel-stage rates (problem → commitment) and showed → qualified aren't tracked per call yet, so they show n/a.
          </p>
        </div>

        {alerts.length > 0 && (
          <div className="space-y-1">
            {alerts.map(({ r, k, v, s }) => {
              const d = DIAGNOSTICS.find((x) => x.key === k)!;
              return (
                <p key={`${r.userId}-${k}`} className="flex items-center gap-2 text-xs text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {r.name}: {d.label} {v?.toFixed(1)}{d.unit} — {s === "high" ? `above ${d.above}${k === "dials_per_hour" ? " (list-burning)" : ""}` : `below ${d.below}${d.unit}`}
                </p>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
