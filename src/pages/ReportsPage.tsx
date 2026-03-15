import { useState, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { StatCard } from "@/components/StatCard";
import { useContacts } from "@/hooks/useContacts";
import { useCallLogsByDateRange } from "@/hooks/useCallLogs";
import { INDUSTRIES, OUTCOME_CONFIG, CallOutcome } from "@/data/mockData";
import { Input } from "@/components/ui/input";
import { CalendarIcon, TrendingUp, BarChart3 } from "lucide-react";

export default function ReportsPage() {
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);

  const { data: contacts = [] } = useContacts();
  const { data: callLogs = [], isLoading } = useCallLogsByDateRange(dateFrom, dateTo);

  const totalContacts = contacts.length;
  const calledInRange = callLogs.length;
  const booked = callLogs.filter((l) => l.outcome === "booked").length;
  const conversionRate = calledInRange > 0 ? Math.round((booked / calledInRange) * 100) : 0;

  // Daily call volume for the range
  const dailyVolume = useMemo(() => {
    const map: Record<string, number> = {};
    for (const log of callLogs) {
      const day = log.created_at.split("T")[0];
      map[day] = (map[day] || 0) + 1;
    }
    // Sort by date
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));
  }, [callLogs]);

  const maxVolume = Math.max(1, ...dailyVolume.map((d) => d.count));

  // Outcome breakdown for range
  const outcomeCounts = useMemo(() => {
    const counts: Partial<Record<string, number>> = {};
    for (const log of callLogs) {
      counts[log.outcome] = (counts[log.outcome] || 0) + 1;
    }
    return counts;
  }, [callLogs]);

  // Industry penetration
  const industryStats = INDUSTRIES.map((ind) => {
    const total = contacts.filter((c) => c.industry === ind).length;
    const called = contacts.filter((c) => c.industry === ind && c.status === "called").length;
    return { industry: ind, total, called, pct: total > 0 ? Math.round((called / total) * 100) : 0 };
  }).filter((s) => s.total > 0);

  // Conversion funnel
  const funnelSteps = [
    { label: "Total Leads", value: totalContacts },
    { label: "Called", value: calledInRange },
    { label: "Interested", value: calledInRange - (outcomeCounts.not_interested || 0) - (outcomeCounts.wrong_number || 0) - (outcomeCounts.dnc || 0) },
    { label: "Follow-ups", value: outcomeCounts.follow_up || 0 },
    { label: "Booked", value: booked },
  ];

  return (
    <AppLayout title="Reports">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Date range */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">From</span>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-[160px] bg-card border-border text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">To</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-[160px] bg-card border-border text-sm"
            />
          </div>
          {isLoading && <span className="text-xs text-muted-foreground animate-pulse ml-2">Loading...</span>}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Calls in Period" value={calledInRange} />
          <StatCard label="Bookings" value={booked} />
          <StatCard label="Conversion Rate" value={`${conversionRate}%`} subtext="booked / called" />
          <StatCard label="Total Leads" value={totalContacts} />
        </div>

        {/* Daily Volume Chart */}
        {dailyVolume.length > 0 && (
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-4 w-4 text-primary" />
              <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Daily Call Volume</h3>
            </div>
            <div className="flex items-end gap-1 h-32">
              {dailyVolume.map((d) => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0 group relative">
                  <div
                    className="w-full bg-primary/80 rounded-t transition-all hover:bg-primary min-h-[2px]"
                    style={{ height: `${(d.count / maxVolume) * 100}%` }}
                  />
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 hidden group-hover:block bg-foreground text-background text-[10px] px-1.5 py-0.5 rounded font-mono whitespace-nowrap">
                    {d.date.slice(5)}: {d.count}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-[10px] font-mono text-muted-foreground">{dailyVolume[0]?.date.slice(5)}</span>
              <span className="text-[10px] font-mono text-muted-foreground">{dailyVolume[dailyVolume.length - 1]?.date.slice(5)}</span>
            </div>
          </div>
        )}

        {/* Two columns: Funnel + Outcomes */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Conversion Funnel */}
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Conversion Funnel</h3>
            </div>
            <div className="space-y-3">
              {funnelSteps.map((step, i) => {
                const widthPct = funnelSteps[0].value > 0
                  ? Math.max(5, Math.round((step.value / funnelSteps[0].value) * 100))
                  : 5;
                return (
                  <div key={step.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{step.label}</span>
                      <span className="font-mono font-medium text-foreground">{step.value}</span>
                    </div>
                    <div className="h-3 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${widthPct}%`, opacity: 1 - i * 0.15 }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Outcome Breakdown */}
          <div className="bg-card border border-border rounded-lg p-5">
            <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-4">
              Outcome Breakdown
            </h3>
            <div className="space-y-2">
              {(Object.keys(OUTCOME_CONFIG) as CallOutcome[]).map((outcome) => {
                const config = OUTCOME_CONFIG[outcome];
                const count = outcomeCounts[outcome] || 0;
                const pct = calledInRange > 0 ? Math.round((count / calledInRange) * 100) : 0;
                return (
                  <div key={outcome} className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${config.bgClass}`} />
                    <span className="text-xs text-foreground w-28 shrink-0">{config.label}</span>
                    <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${config.bgClass}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-muted-foreground w-12 text-right">{count}</span>
                    <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Industry penetration */}
        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-4">
            List Penetration by Industry
          </h3>
          {industryStats.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No contacts uploaded yet.</p>
          ) : (
            <div className="space-y-3">
              {industryStats.map((stat) => (
                <div key={stat.industry} className="flex items-center gap-4">
                  <span className="text-xs font-medium text-foreground w-32 shrink-0">{stat.industry}</span>
                  <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${stat.pct}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-muted-foreground w-16 text-right">
                    {stat.called}/{stat.total}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
