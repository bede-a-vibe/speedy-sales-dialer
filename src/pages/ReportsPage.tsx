import { useMemo, useState } from "react";
import { CalendarIcon, TrendingUp, BarChart3 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { StatCard } from "@/components/StatCard";
import { Input } from "@/components/ui/input";
import { useContacts } from "@/hooks/useContacts";
import { useCallLogsByDateRange } from "@/hooks/useCallLogs";
import { useBookedAppointmentsByDateRange } from "@/hooks/usePipelineItems";
import { INDUSTRIES, OUTCOME_CONFIG, CallOutcome } from "@/data/mockData";
import { APPOINTMENT_OUTCOME_LABELS } from "@/lib/appointments";

export default function ReportsPage() {
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);

  const { data: contacts = [] } = useContacts();
  const { data: callLogs = [], isLoading } = useCallLogsByDateRange(dateFrom, dateTo);
  const { data: bookedAppointments = [], isLoading: bookedLoading } = useBookedAppointmentsByDateRange(dateFrom, dateTo);

  const totalContacts = contacts.length;
  const calledInRange = callLogs.length;
  const booked = callLogs.filter((l) => l.outcome === "booked").length;
  const conversionRate = calledInRange > 0 ? Math.round((booked / calledInRange) * 100) : 0;

  const dailyVolume = useMemo(() => {
    const map: Record<string, number> = {};
    for (const log of callLogs) {
      const day = log.created_at.split("T")[0];
      map[day] = (map[day] || 0) + 1;
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));
  }, [callLogs]);

  const maxVolume = Math.max(1, ...dailyVolume.map((d) => d.count));

  const outcomeCounts = useMemo(() => {
    const counts: Partial<Record<string, number>> = {};
    for (const log of callLogs) {
      counts[log.outcome] = (counts[log.outcome] || 0) + 1;
    }
    return counts;
  }, [callLogs]);

  const appointmentCounts = useMemo(() => {
    const counts: Partial<Record<keyof typeof APPOINTMENT_OUTCOME_LABELS, number>> = {};
    for (const item of bookedAppointments) {
      if (!item.appointment_outcome) continue;
      counts[item.appointment_outcome] = (counts[item.appointment_outcome] || 0) + 1;
    }
    return counts;
  }, [bookedAppointments]);

  const appointmentTotal = bookedAppointments.length;
  const appointmentResolved = bookedAppointments.filter((item) => !!item.appointment_outcome).length;
  const noShows = appointmentCounts.no_show || 0;
  const showedClosed = appointmentCounts.showed_closed || 0;
  const showedNoClose = appointmentCounts.showed_no_close || 0;
  const appointmentCloseRate = appointmentResolved > 0 ? Math.round((showedClosed / appointmentResolved) * 100) : 0;

  const industryStats = INDUSTRIES.map((ind) => {
    const total = contacts.filter((c) => c.industry === ind).length;
    const called = contacts.filter((c) => c.industry === ind && c.status === "called").length;
    return { industry: ind, total, called, pct: total > 0 ? Math.round((called / total) * 100) : 0 };
  }).filter((s) => s.total > 0);

  const funnelSteps = [
    { label: "Total Leads", value: totalContacts },
    { label: "Called", value: calledInRange },
    { label: "Interested", value: calledInRange - (outcomeCounts.not_interested || 0) - (outcomeCounts.wrong_number || 0) - (outcomeCounts.dnc || 0) },
    { label: "Follow-ups", value: outcomeCounts.follow_up || 0 },
    { label: "Booked", value: booked },
  ];

  return (
    <AppLayout title="Reports">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">From</span>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[160px] bg-card border-border text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">To</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[160px] bg-card border-border text-sm" />
          </div>
          {(isLoading || bookedLoading) && <span className="ml-2 animate-pulse text-xs text-muted-foreground">Loading...</span>}
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Calls in Period" value={calledInRange} />
          <StatCard label="Bookings" value={booked} />
          <StatCard label="Conversion Rate" value={`${conversionRate}%`} subtext="booked / called" />
          <StatCard label="Total Leads" value={totalContacts} />
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Appointments" value={appointmentTotal} />
          <StatCard label="No Shows" value={noShows} />
          <StatCard label="Showed Closed" value={showedClosed} />
          <StatCard label="Appointment Close Rate" value={`${appointmentCloseRate}%`} subtext="closed / resolved" />
        </div>

        {dailyVolume.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Daily Call Volume</h3>
            </div>
            <div className="flex h-32 items-end gap-1">
              {dailyVolume.map((d) => (
                <div key={d.date} className="group relative flex min-w-0 flex-1 flex-col items-center gap-1">
                  <div className="min-h-[2px] w-full rounded-t bg-primary/80 transition-all hover:bg-primary" style={{ height: `${(d.count / maxVolume) * 100}%` }} />
                  <div className="absolute left-1/2 -top-6 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] font-mono text-background group-hover:block">
                    {d.date.slice(5)}: {d.count}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between">
              <span className="text-[10px] font-mono text-muted-foreground">{dailyVolume[0]?.date.slice(5)}</span>
              <span className="text-[10px] font-mono text-muted-foreground">{dailyVolume[dailyVolume.length - 1]?.date.slice(5)}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Conversion Funnel</h3>
            </div>
            <div className="space-y-3">
              {funnelSteps.map((step, i) => {
                const widthPct = funnelSteps[0].value > 0 ? Math.max(5, Math.round((step.value / funnelSteps[0].value) * 100)) : 5;
                return (
                  <div key={step.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{step.label}</span>
                      <span className="font-mono font-medium text-foreground">{step.value}</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${widthPct}%`, opacity: 1 - i * 0.15 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="mb-4 text-[10px] uppercase tracking-widest text-muted-foreground">Outcome Breakdown</h3>
            <div className="space-y-2">
              {(Object.keys(OUTCOME_CONFIG) as CallOutcome[]).map((outcome) => {
                const config = OUTCOME_CONFIG[outcome];
                const count = outcomeCounts[outcome] || 0;
                const pct = calledInRange > 0 ? Math.round((count / calledInRange) * 100) : 0;
                return (
                  <div key={outcome} className="flex items-center gap-3">
                    <div className={`h-2 w-2 shrink-0 rounded-full ${config.bgClass}`} />
                    <span className="w-28 shrink-0 text-xs text-foreground">{config.label}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div className={`h-full rounded-full ${config.bgClass}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-12 text-right text-xs font-mono text-muted-foreground">{count}</span>
                    <span className="w-8 text-right font-mono text-[10px] text-muted-foreground">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="mb-4 text-[10px] uppercase tracking-widest text-muted-foreground">Appointment Outcomes</h3>
            <div className="space-y-3">
              {Object.entries(APPOINTMENT_OUTCOME_LABELS).map(([key, label]) => {
                const count = appointmentCounts[key as keyof typeof APPOINTMENT_OUTCOME_LABELS] || 0;
                const pct = appointmentResolved > 0 ? Math.round((count / appointmentResolved) * 100) : 0;
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-mono text-foreground">{count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">Resolved appointments: {appointmentResolved} · Showed no close: {showedNoClose}</p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="mb-4 text-[10px] uppercase tracking-widest text-muted-foreground">List Penetration by Industry</h3>
            {industryStats.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">No contacts uploaded yet.</p>
            ) : (
              <div className="space-y-3">
                {industryStats.map((stat) => (
                  <div key={stat.industry} className="flex items-center gap-4">
                    <span className="w-32 shrink-0 text-xs font-medium text-foreground">{stat.industry}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${stat.pct}%` }} />
                    </div>
                    <span className="w-16 text-right text-xs font-mono text-muted-foreground">{stat.called}/{stat.total}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
