import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  PRODUCTIVE_DAYS_PER_MONTH, dailyTargetsFor, periodDays, productiveHours, rampForTenure,
} from "@/lib/kpiStandards";

type Period = "day" | "week" | "month";
const SHOWED = new Set(["showed_closed", "showed_no_close", "showed_verbal_commitment", "second_meeting_booked", "no_close_follow_up"]);

function periodStart(p: Period): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (p === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (p === "month") d.setDate(1);
  return d;
}

const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

function usePeriodData(period: Period) {
  return useQuery({
    queryKey: ["kpi-period", period],
    staleTime: 60_000,
    queryFn: async () => {
      const since = periodStart(period).toISOString();
      const logs: any[] = [];
      for (let page = 0; ; page++) {
        const { data, error } = await supabase.from("call_logs")
          .select("user_id, outcome, created_at").gte("created_at", since)
          .order("created_at", { ascending: true }).range(page * 1000, page * 1000 + 999);
        if (error) throw error;
        logs.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      const [profiles, appts] = await Promise.all([
        supabase.from("profiles").select("user_id, display_name, email, created_at"),
        supabase.from("pipeline_items").select("created_by, appointment_outcome, scheduled_for")
          .eq("pipeline_type", "booked").gte("scheduled_for", since).lte("scheduled_for", new Date().toISOString()),
      ]);
      if (profiles.error) throw profiles.error;
      if (appts.error) throw appts.error;
      return { logs, profiles: profiles.data ?? [], appts: appts.data ?? [] };
    },
  });
}

interface Metric { label: string; actual: number; pace: number | null; full: number | null; digits: number }

function Bar({ m }: { m: Metric }) {
  const pct = m.full ? Math.min(100, (100 * m.actual) / m.full) : 0;
  const onPace = m.pace == null ? null : m.actual >= m.pace;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{m.label}</span>
        <span className="font-mono tabular-nums">
          <span className={cn("font-semibold", onPace === true && "text-[hsl(var(--outcome-booked))]", onPace === false && "text-destructive")}>
            {m.actual.toFixed(m.digits)}
          </span>
          <span className="text-muted-foreground"> / {m.full == null ? "—" : m.full.toFixed(m.digits)}</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className={cn("h-full rounded-full", onPace === false ? "bg-destructive" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
      {m.pace != null && <p className="text-[10px] text-muted-foreground">Pace for days worked: {m.pace.toFixed(m.digits)}</p>}
    </div>
  );
}

/**
 * Daily / weekly / monthly targets per rep. Full-period target = tenure-band
 * daily target × period days (1 / 5 / 18.6). Pace target = daily × days the
 * rep actually dialled so far, so leave and days off don't count against them.
 */
export function KpiPeriodTargets({ userId }: { userId?: string }) {
  const [period, setPeriod] = useState<Period>("week");
  const { data, isLoading } = usePeriodData(period);

  const reps = useMemo(() => {
    if (!data) return [];
    const byUser = new Map<string, any[]>();
    for (const l of data.logs) {
      if (!l.user_id || (userId && l.user_id !== userId)) continue;
      (byUser.get(l.user_id) ?? byUser.set(l.user_id, []).get(l.user_id)!).push(l);
    }
    return [...byUser.entries()].map(([uid, logs]) => {
      const p: any = data.profiles.find((x: any) => x.user_id === uid);
      const { band, day } = rampForTenure(p?.created_at);
      const t = dailyTargetsFor(band);
      const perDay = new Map<string, number[]>();
      let sets = 0;
      for (const l of logs) {
        const ms = new Date(l.created_at).getTime();
        const k = dayKey(ms);
        (perDay.get(k) ?? perDay.set(k, []).get(k)!).push(ms);
        if (l.outcome === "booked") sets++;
      }
      let hours = 0;
      for (const ts of perDay.values()) hours += productiveHours(ts);
      const worked = perDay.size;
      const mine = data.appts.filter((a: any) => a.created_by === uid);
      const showed = mine.filter((a: any) => SHOWED.has(a.appointment_outcome)).length;
      const closed = mine.filter((a: any) => a.appointment_outcome === "showed_closed").length;
      const full = periodDays(period);
      const mk = (label: string, actual: number, daily: number | null, digits: number): Metric => ({
        label, actual, digits,
        full: daily == null ? null : daily * full,
        pace: daily == null || period === "day" ? null : daily * worked,
      });
      return {
        uid, day, band: band.label, worked,
        name: p?.display_name || p?.email?.split("@")[0] || "Unknown",
        booksPerHour: hours > 0.25 ? sets / hours : null, booksTarget: t.booksPerHour,
        metrics: [
          mk("Productive hours", hours, t.hours, 1),
          mk("Meetings set", sets, t.sets, 1),
          mk("Meetings showed", showed, t.showed, 1),
          mk("Deals closed", closed, t.closed, 2),
        ],
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [data, userId, period]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarRange className="h-5 w-5 text-primary" /> Daily, weekly &amp; monthly targets
            </CardTitle>
            <CardDescription>
              Targets follow each rep's tenure. Full targets use 1 / 5 / {PRODUCTIVE_DAYS_PER_MONTH} productive days; pace counts only the days they actually dialled.
            </CardDescription>
          </div>
          <div className="flex gap-1">
            {(["day", "week", "month"] as Period[]).map((p) => (
              <Button key={p} size="sm" variant={period === p ? "default" : "outline"} onClick={() => setPeriod(p)}>
                {p === "day" ? "Today" : p === "week" ? "This week" : "This month"}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-xs text-muted-foreground">Loading…</p>
          : reps.length === 0 ? <p className="text-xs text-muted-foreground">No dialling yet this {period}.</p>
          : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {reps.map((r) => (
                <div key={r.uid} className="space-y-3 rounded-lg border border-border p-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium">{r.name}</span>
                    <span className="text-[10px] text-muted-foreground">{r.band} · {r.worked} day{r.worked === 1 ? "" : "s"} worked</span>
                  </div>
                  {r.metrics.map((m) => <Bar key={m.label} m={m} />)}
                  <div className="flex justify-between border-t border-border pt-2 text-xs">
                    <span className="text-muted-foreground">Bookings per productive hour</span>
                    <span className="font-mono">
                      <span className={cn("font-semibold",
                        r.booksPerHour != null && r.booksTarget != null && (r.booksPerHour >= r.booksTarget ? "text-[hsl(var(--outcome-booked))]" : "text-destructive"))}>
                        {r.booksPerHour == null ? "—" : r.booksPerHour.toFixed(2)}
                      </span>
                      <span className="text-muted-foreground"> / {r.booksTarget ?? "—"}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
      </CardContent>
    </Card>
  );
}
