import { useMemo, useState } from "react";
import { Clock, Phone, PhoneCall, Gauge } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSalesReps } from "@/hooks/usePipelineItems";
import { useDialpadCallStats, formatTalk, type DialpadCallStatRow } from "@/hooks/useDialpadCallStats";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7am → 8pm

function melbDayHour(iso: string): { day: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Australia/Melbourne",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return { day: map[wd] ?? 0, hour };
}

function hourLabel(h: number): string {
  const suffix = h < 12 ? "a" : "p";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}${suffix}`;
}

function Tile({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
            <p className="mt-1 font-mono text-2xl font-bold text-foreground tabular-nums">{value}</p>
            {sub && <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>}
          </div>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

export function TalkTimePanel() {
  const [days, setDays] = useState(30);
  const [rep, setRep] = useState("all");
  const { data: calls = [], isLoading } = useDialpadCallStats(days);
  const { data: reps = [] } = useSalesReps();

  const repName = useMemo(() => {
    const m = new Map(reps.map((r) => [r.user_id, r.display_name || r.email || "Unknown"]));
    return (uid: string | null) => (uid ? m.get(uid) ?? "Unknown rep" : "Unassigned");
  }, [reps]);

  // Per-rep aggregation.
  const perRep = useMemo(() => {
    const m = new Map<string, { calls: number; connected: number; talk: number }>();
    for (const c of calls) {
      if (!c.user_id) continue;
      const r = m.get(c.user_id) ?? { calls: 0, connected: 0, talk: 0 };
      r.calls += 1;
      if (c.is_connected) r.connected += 1;
      r.talk += c.talk_time_seconds ?? 0;
      m.set(c.user_id, r);
    }
    return [...m.entries()]
      .map(([uid, r]) => ({
        uid,
        name: repName(uid),
        ...r,
        avgTalk: r.connected > 0 ? r.talk / r.connected : 0,
        connectRate: r.calls > 0 ? r.connected / r.calls : 0,
      }))
      .sort((a, b) => b.talk - a.talk);
  }, [calls, repName]);

  const totals = useMemo(() => {
    const totalCalls = calls.length;
    const connected = calls.filter((c) => c.is_connected).length;
    const talk = calls.reduce((s, c) => s + (c.talk_time_seconds ?? 0), 0);
    return {
      totalCalls,
      connected,
      talk,
      connectRate: totalCalls > 0 ? connected / totalCalls : 0,
      avgTalk: connected > 0 ? talk / connected : 0,
    };
  }, [calls]);

  // Heat map: talk-time seconds by [day][hour], filtered by selected rep.
  const heat = useMemo(() => {
    const filtered: DialpadCallStatRow[] = rep === "all" ? calls : calls.filter((c) => c.user_id === rep);
    const grid: number[][] = DAY_LABELS.map(() => HOURS.map(() => 0));
    let max = 0;
    for (const c of filtered) {
      if (!c.started_at) continue;
      const { day, hour } = melbDayHour(c.started_at);
      const hi = HOURS.indexOf(hour);
      if (hi === -1) continue;
      grid[day][hi] += c.talk_time_seconds ?? 0;
      if (grid[day][hi] > max) max = grid[day][hi];
    }
    return { grid, max };
  }, [calls, rep]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Talk time</h3>
          <p className="text-xs text-muted-foreground">Live from Dialpad — connected talk time, per rep and by time of week (Melbourne).</p>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Total talk time" value={isLoading ? "—" : formatTalk(totals.talk)} sub="connected time" icon={Clock} />
        <Tile label="Calls" value={isLoading ? "—" : totals.totalCalls.toLocaleString()} sub={`${totals.connected} connected`} icon={Phone} />
        <Tile label="Connect rate" value={isLoading ? "—" : `${Math.round(totals.connectRate * 100)}%`} sub="answered / dialled" icon={PhoneCall} />
        <Tile label="Avg talk / connect" value={isLoading ? "—" : formatTalk(totals.avgTalk)} sub="per connected call" icon={Gauge} />
      </div>

      {/* Heat map */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm">Talk-time heat map</CardTitle>
              <CardDescription className="text-xs">When talk time actually happens — your best calling windows.</CardDescription>
            </div>
            <Select value={rep} onValueChange={setRep}>
              <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All reps</SelectItem>
                {perRep.map((r) => (
                  <SelectItem key={r.uid} value={r.uid}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="min-w-[520px]">
            {/* header: hour labels */}
            <div className="grid" style={{ gridTemplateColumns: `2.5rem repeat(${HOURS.length}, minmax(0,1fr))` }}>
              <div />
              {HOURS.map((h) => (
                <div key={h} className="pb-1 text-center text-[9px] font-mono text-muted-foreground">{hourLabel(h)}</div>
              ))}
            </div>
            {/* rows */}
            {DAY_LABELS.map((label, di) => (
              <div key={label} className="grid items-center" style={{ gridTemplateColumns: `2.5rem repeat(${HOURS.length}, minmax(0,1fr))` }}>
                <div className="pr-2 text-right text-[10px] font-mono text-muted-foreground">{label}</div>
                {HOURS.map((h, hi) => {
                  const v = heat.grid[di][hi];
                  const intensity = heat.max > 0 ? v / heat.max : 0;
                  return (
                    <div key={h} className="p-[1px]">
                      <div
                        title={`${label} ${hourLabel(h)} — ${formatTalk(v)} talk time`}
                        className="aspect-square rounded-[3px] border border-border/40 transition-colors"
                        style={{
                          backgroundColor: v > 0 ? `hsl(var(--primary) / ${(0.14 + 0.86 * intensity).toFixed(3)})` : "hsl(var(--muted) / 0.5)",
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
            {/* legend */}
            <div className="mt-3 flex items-center justify-end gap-2 text-[10px] text-muted-foreground">
              <span>Less</span>
              {[0.14, 0.35, 0.55, 0.75, 1].map((a) => (
                <span key={a} className="h-3 w-3 rounded-[2px] border border-border/40" style={{ backgroundColor: `hsl(var(--primary) / ${a})` }} />
              ))}
              <span>More talk time</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-rep table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">By rep</CardTitle>
          <CardDescription className="text-xs">Talk time and connect rate per rep ({days}d).</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && <p className="p-6 text-xs text-muted-foreground">Loading…</p>}
          {!isLoading && perRep.length === 0 && (
            <p className="p-6 text-xs text-muted-foreground">No Dialpad calls in this window yet.</p>
          )}
          {perRep.length > 0 && (
            <div className="divide-y divide-border">
              <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground bg-muted/30">
                <div className="col-span-4">Rep</div>
                <div className="col-span-2 text-right">Calls</div>
                <div className="col-span-2 text-right">Connect</div>
                <div className="col-span-2 text-right">Talk time</div>
                <div className="col-span-2 text-right">Avg / connect</div>
              </div>
              {perRep.map((r) => (
                <div key={r.uid} className="grid grid-cols-12 gap-2 px-4 py-2.5 text-sm items-center">
                  <div className="col-span-4 font-medium truncate">{r.name}</div>
                  <div className="col-span-2 text-right font-mono tabular-nums">{r.calls}</div>
                  <div className="col-span-2 text-right font-mono tabular-nums">
                    {r.connected}<span className="text-muted-foreground text-[10px]"> · {Math.round(r.connectRate * 100)}%</span>
                  </div>
                  <div className="col-span-2 text-right font-mono tabular-nums text-foreground">{formatTalk(r.talk)}</div>
                  <div className="col-span-2 text-right font-mono tabular-nums text-muted-foreground">{formatTalk(r.avgTalk)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
