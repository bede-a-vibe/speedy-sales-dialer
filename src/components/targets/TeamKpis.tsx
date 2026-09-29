import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Gauge, RotateCcw, Settings2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { fetchDialpadHours } from "@/lib/dialpadHours";
import { productiveHours, periodDays } from "@/lib/kpiStandards";
import { useTeamTargets, useSaveTeamTargets } from "@/hooks/useKpiSettings";
import { useIsAdmin } from "@/hooks/useUserRole";
import { TARGET_FIELDS, targetsFor, type RoleKey, type TargetKey, type TeamTargetsConfig, type Targets } from "@/lib/teamTargets";

type Period = "day" | "week" | "month";
const ANSWERED = new Set(["booked", "not_interested", "follow_up", "dnc", "gatekeeper", "disqualified"]);
const SHOWED = new Set(["showed_closed", "showed_no_close", "showed_verbal_commitment", "second_meeting_booked", "no_close_follow_up", "disqualified"]);
const DUE = (o: string | null) => !!o && o !== "rescheduled";
const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

function periodStart(p: Period) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (p === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  if (p === "month") d.setDate(1);
  return d;
}

function useData(period: Period) {
  return useQuery({
    queryKey: ["team-kpis", period],
    staleTime: 60_000,
    queryFn: async () => {
      const since = periodStart(period).toISOString();
      const logs: any[] = [];
      for (let page = 0; ; page++) {
        const { data, error } = await supabase.from("call_logs")
          .select("id, user_id, outcome, dialpad_talk_time_seconds, created_at").gte("created_at", since)
          .order("created_at", { ascending: true }).range(page * 1000, page * 1000 + 999);
        if (error) throw error;
        logs.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      const [profiles, booked, dp, scores, reviews] = await Promise.all([
        supabase.from("profiles").select("user_id, display_name, email, is_active"),
        supabase.from("pipeline_items").select("created_by, assigned_user_id, appointment_outcome, is_qualified, created_at, scheduled_for")
          .eq("pipeline_type", "booked").gte("created_at", since),
        fetchDialpadHours(since),
        supabase.from("call_scores").select("call_log_id, stage_problem_solution, stage_solution_commit, call_logs!inner(user_id)").gte("created_at", since).limit(5000),
        supabase.from("call_reviews").select("call_log_id, stage_problem_solution, stage_solution_commit").gte("created_at", since).limit(5000),
      ]);
      const stages = new Map<string, any>();
      for (const r of (scores.data ?? []) as any[]) stages.set(r.call_log_id, { ...r, user_id: r.call_logs?.user_id });
      for (const r of (reviews.data ?? []) as any[]) {
        const b = stages.get(r.call_log_id); if (!b) continue;
        if (r.stage_problem_solution != null) b.stage_problem_solution = r.stage_problem_solution;
        if (r.stage_solution_commit != null) b.stage_solution_commit = r.stage_solution_commit;
      }
      return { logs, profiles: (profiles.data ?? []) as any[], booked: (booked.data ?? []) as any[], dp, stages: [...stages.values()] };
    },
  });
}

const pct = (a: number, b: number) => (b > 0 ? (100 * a) / b : null);

interface RepStats { uid: string; name: string; role: RoleKey; t: Targets; worked: number; estimated: boolean; actual: Record<TargetKey, number | null>; totals: { dials: number; hours: number; bookings: number } }

/** Editable targets table: role defaults + per-person overrides (blank = use role default). */
function TargetsEditor({ reps }: { reps: { uid: string; name: string }[] }) {
  const { data: cfg } = useTeamTargets();
  const save = useSaveTeamTargets();
  const [draft, setDraft] = useState<TeamTargetsConfig | null>(null);
  useEffect(() => { if (cfg) setDraft(structuredClone(cfg)); }, [cfg]);
  if (!draft) return null;

  const setVal = (scope: "role" | "user", id: string, key: TargetKey, raw: string) => {
    const v = raw.trim() === "" || Number.isNaN(Number(raw)) ? null : Number(raw);
    setDraft((d) => {
      if (!d) return d;
      const n = structuredClone(d);
      const bucket = scope === "role" ? ((n.roles as any)[id] ??= {}) : (n.users[id] ??= {});
      if (v == null) delete bucket[key]; else bucket[key] = v;
      return n;
    });
  };
  const onSave = async () => { try { await save.mutateAsync(draft); toast.success("Targets saved"); } catch (e: any) { toast.error(e.message); } };
  const onReset = async () => {
    if (!confirm("Reset all targets and person overrides back to the defaults?")) return;
    try { await save.mutateAsync(null); toast.success("Targets reset"); } catch (e: any) { toast.error(e.message); }
  };

  const row = (label: React.ReactNode, scope: "role" | "user", id: string, placeholderFrom?: Targets) => (
    <tr key={`${scope}-${id}`} className="border-t border-border">
      <td className="sticky left-0 bg-card py-1.5 pr-3 text-xs font-medium whitespace-nowrap">{label}</td>
      {TARGET_FIELDS.map((f) => {
        const own = scope === "role" ? (draft.roles as any)[id]?.[f.key] : draft.users[id]?.[f.key];
        return (
          <td key={f.key} className="py-1.5 pr-2">
            <Input type="number" step="0.01" className="h-7 w-[72px] px-1.5 font-mono text-xs"
              value={own ?? ""} placeholder={placeholderFrom?.[f.key] != null ? String(placeholderFrom[f.key]) : "—"}
              onChange={(e) => setVal(scope, id, f.key, e.target.value)} />
          </td>
        );
      })}
    </tr>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><Settings2 className="h-5 w-5 text-primary" /> Set targets</CardTitle>
        <CardDescription>Daily numbers and rates. Set the role defaults, then override any box for one person — leave it blank (grey number) to use their role's default. Weekly = daily × 5, monthly = daily × 18.6.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr className="text-left text-[10px] text-muted-foreground">
                <th className="sticky left-0 bg-card py-1 pr-3 font-medium">Who</th>
                {TARGET_FIELDS.map((f) => <th key={f.key} className="py-1 pr-2 font-medium leading-tight">{f.label}{f.unit && ` (${f.unit})`}</th>)}
              </tr>
            </thead>
            <tbody>
              {row("Setter (role)", "role", "setter")}
              {row("Closer (role)", "role", "closer")}
              {reps.map((r) => {
                const role = draft.userRole[r.uid] ?? "setter";
                return row(
                  <div className="flex items-center gap-2">
                    <span>{r.name}</span>
                    <Select value={role} onValueChange={(v) => setDraft((d) => d && ({ ...d, userRole: { ...d.userRole, [r.uid]: v as RoleKey } }))}>
                      <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="setter">Setter</SelectItem><SelectItem value="closer">Closer</SelectItem></SelectContent>
                    </Select>
                  </div>,
                  "user", r.uid, { ...(Object.fromEntries(TARGET_FIELDS.map((f) => [f.key, null])) as Targets), ...(draft.roles[role] as any) },
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between">
          <Button variant="ghost" size="sm" onClick={onReset} disabled={save.isPending}><RotateCcw className="mr-1 h-4 w-4" /> Reset all</Button>
          <Button size="sm" onClick={onSave} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save targets"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricRow({ label, actual, target, unit, pace }: { label: string; actual: number | null; target: number | null; unit: string; pace?: number | null }) {
  const cmp = pace ?? target;
  const good = actual != null && cmp != null && actual >= cmp;
  const bad = actual != null && cmp != null && actual < cmp;
  const d = unit === "%" ? 0 : actual != null && actual < 10 ? 1 : 0;
  return (
    <div className="flex items-baseline justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">
        <span className={cn("font-semibold", good && "text-[hsl(var(--outcome-booked))]", bad && "text-destructive")}>{actual == null ? "—" : `${actual.toFixed(d)}${unit}`}</span>
        <span className="text-muted-foreground"> / {target == null ? "—" : `${+target.toFixed(1)}${unit}`}</span>
      </span>
    </div>
  );
}

/** Manager → KPIs & targets: one page to set targets per role/person and see every rep against them. */
export function TeamKpis() {
  const isAdmin = useIsAdmin();
  const [period, setPeriod] = useState<Period>("week");
  const [editing, setEditing] = useState(false);
  const { data, isLoading } = useData(period);
  const { data: cfg } = useTeamTargets();

  const reps = useMemo<RepStats[]>(() => {
    if (!data || !cfg) return [];
    const ids = new Set<string>();
    for (const l of data.logs) if (l.user_id) ids.add(l.user_id);
    for (const b of data.booked) { if (b.created_by) ids.add(b.created_by); if (b.assigned_user_id) ids.add(b.assigned_user_id); }
    for (const uid of Object.keys(cfg.userRole)) ids.add(uid);
    return [...ids].map((uid) => {
      const p = data.profiles.find((x) => x.user_id === uid);
      if (p && p.is_active === false) return null;
      const { role, t } = targetsFor(cfg, uid);
      const logs = data.logs.filter((l) => l.user_id === uid);
      const perDay = new Map<string, number[]>();
      let pickups = 0, conv = 0, bookings = 0;
      for (const l of logs) {
        const ms = new Date(l.created_at).getTime();
        (perDay.get(dayKey(ms)) ?? perDay.set(dayKey(ms), []).get(dayKey(ms))!).push(ms);
        if (ANSWERED.has(l.outcome)) pickups++;
        if ((l.dialpad_talk_time_seconds ?? 0) >= 120) conv++;
        if (l.outcome === "booked") bookings++;
      }
      const dp = data.dp.get(uid);
      let hours = 0;
      if (dp) hours = dp.hours; else for (const ts of perDay.values()) hours += productiveHours(ts);
      const worked = Math.max(1, dp ? dp.days : perDay.size);
      const st = data.stages.filter((s) => s.user_id === uid);
      const reachedProblem = st.filter((s) => s.stage_problem_solution != null);
      const reachedSolution = st.filter((s) => s.stage_solution_commit != null);
      const mine = data.booked.filter((b) => (role === "closer" ? b.assigned_user_id : b.created_by) === uid);
      const judged = mine.filter((b) => b.is_qualified != null);
      const qualified = mine.filter((b) => b.is_qualified === true);
      const due = mine.filter((b) => DUE(b.appointment_outcome));
      const showed = due.filter((b) => SHOWED.has(b.appointment_outcome));
      const qDue = qualified.filter((b) => DUE(b.appointment_outcome));
      const qShowed = qDue.filter((b) => SHOWED.has(b.appointment_outcome));
      const closeBase = showed.filter((b) => b.appointment_outcome !== "disqualified");
      const actual: Record<TargetKey, number | null> = {
        dialsPerDay: logs.length / worked,
        hoursPerDay: hours / worked,
        pickupRate: pct(pickups, logs.length),
        convRate: pct(conv, pickups),
        problemRate: pct(reachedProblem.length, st.length),
        solutionRate: pct(reachedProblem.filter((s) => s.stage_problem_solution).length, reachedProblem.length),
        commitRate: pct(reachedSolution.filter((s) => s.stage_solution_commit).length, reachedSolution.length),
        bookingsPerDay: (role === "closer" ? mine.length : bookings) / worked,
        bookingsPerPickup: pct(bookings, pickups),
        qualifiedRate: pct(qualified.length, judged.length),
        showRate: pct(showed.length, due.length),
        qualifiedShowRate: pct(qShowed.length, qDue.length),
        closeRate: pct(closeBase.filter((b) => b.appointment_outcome === "showed_closed").length, closeBase.length),
      };
      return {
        uid, role, t, worked, estimated: !dp, actual, totals: { dials: logs.length, hours, bookings },
        name: p?.display_name || p?.email?.split("@")[0] || "Unknown",
      } as RepStats;
    }).filter(Boolean).sort((a, b) => a!.name.localeCompare(b!.name)) as RepStats[];
  }, [data, cfg]);

  const days = periodDays(period);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base"><Gauge className="h-5 w-5 text-primary" /> KPIs &amp; targets</CardTitle>
              <CardDescription>
                Every rep against their targets. Counts show the period total vs target; green = on pace for the days they actually dialled. Productive hours = dials × 30s + talk time + 5 min per booking. Qualified = closer ticked "Qualified" on the meeting.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-1">
              {isAdmin && <Button size="sm" variant={editing ? "default" : "outline"} onClick={() => setEditing((v) => !v)}><Settings2 className="mr-1 h-3.5 w-3.5" /> Set targets</Button>}
              {(["day", "week", "month"] as Period[]).map((p) => (
                <Button key={p} size="sm" variant={period === p ? "default" : "outline"} onClick={() => setPeriod(p)}>
                  {p === "day" ? "Today" : p === "week" ? "This week" : "This month"}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
      </Card>

      {editing && isAdmin && <TargetsEditor reps={reps.map((r) => ({ uid: r.uid, name: r.name }))} />}

      {isLoading ? <p className="text-xs text-muted-foreground">Loading…</p>
        : reps.length === 0 ? <p className="text-xs text-muted-foreground">No activity yet this period.</p>
        : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {reps.map((r) => {
              const { t, actual: a } = r;
              const total = (k: TargetKey) => (a[k] == null ? null : a[k]! * r.worked);
              const full = (k: TargetKey) => (t[k] == null ? null : t[k]! * days);
              const pace = (k: TargetKey) => (t[k] == null ? null : t[k]! * r.worked);
              // Biggest shortfall among the conversation rates = what to work on.
              const gaps = TARGET_FIELDS.filter((f) => f.kind === "rate" && t[f.key] != null && a[f.key] != null && a[f.key]! < t[f.key]!)
                .map((f) => ({ f, gap: 1 - a[f.key]! / t[f.key]! })).sort((x, y) => y.gap - x.gap);
              const bookTarget = t.bookingsPerDay;
              const realRate = r.totals.dials > 0 ? r.totals.bookings / r.totals.dials : 0;
              const needReal = bookTarget && realRate > 0 ? Math.ceil(bookTarget / realRate) : null;
              const needTarget = bookTarget && t.pickupRate && t.bookingsPerPickup ? Math.ceil(bookTarget / ((t.pickupRate / 100) * (t.bookingsPerPickup / 100))) : null;
              return (
                <Card key={r.uid}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-semibold">{r.name}</span>
                      <span className="text-[10px] text-muted-foreground capitalize">{r.role} · {r.worked} day{r.worked === 1 ? "" : "s"} worked{r.estimated ? " · hrs est." : ""}</span>
                    </div>

                    <div className="space-y-1">
                      <p className="text-[10px] font-mono uppercase tracking-widest text-primary">Activity</p>
                      <MetricRow label="Dials" actual={total("dialsPerDay")} target={full("dialsPerDay")} pace={pace("dialsPerDay")} unit="" />
                      <MetricRow label="Productive hours" actual={total("hoursPerDay")} target={full("hoursPerDay")} pace={pace("hoursPerDay")} unit="" />
                      <MetricRow label="Meetings set" actual={total("bookingsPerDay")} target={full("bookingsPerDay")} pace={pace("bookingsPerDay")} unit="" />
                    </div>

                    <div className="space-y-1">
                      <p className="text-[10px] font-mono uppercase tracking-widest text-primary">Conversation stages</p>
                      {(["pickupRate", "convRate", "problemRate", "solutionRate", "commitRate", "bookingsPerPickup"] as TargetKey[]).map((k) => (
                        <MetricRow key={k} label={TARGET_FIELDS.find((f) => f.key === k)!.label} actual={a[k]} target={t[k]} unit="%" />
                      ))}
                    </div>

                    <div className="space-y-1">
                      <p className="text-[10px] font-mono uppercase tracking-widest text-primary">Meetings</p>
                      {(["qualifiedRate", "showRate", "qualifiedShowRate", "closeRate"] as TargetKey[]).map((k) => (
                        <MetricRow key={k} label={TARGET_FIELDS.find((f) => f.key === k)!.label} actual={a[k]} target={t[k]} unit="%" />
                      ))}
                    </div>

                    <div className="rounded-md bg-muted/40 p-2 text-xs">
                      <p className="font-medium">Dials needed per day for {bookTarget ?? "—"} bookings</p>
                      <p className="text-muted-foreground">At their real rate: <span className="font-mono font-semibold text-foreground">{needReal ?? "—"}</span> · At target rates: <span className="font-mono font-semibold text-foreground">{needTarget ?? "—"}</span></p>
                    </div>

                    {gaps.length > 0 && (
                      <p className="flex items-start gap-1.5 text-xs text-destructive">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        Work on: {gaps.slice(0, 2).map((g) => `${g.f.label} (${a[g.f.key]!.toFixed(0)}% vs ${t[g.f.key]}%)`).join(", ")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
    </div>
  );
}
