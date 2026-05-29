import { useMemo, useState } from "react";
import { AnalyticsKpiTile } from "./AnalyticsKpiTile";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ReportMetrics } from "@/lib/reportMetrics";

const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

interface Props {
  metrics: ReportMetrics;
  rangeDays: number;
  openBookingsCount: number;
  openBookingsValue: number;
}

export function ForecastingTab({ metrics, rangeDays, openBookingsCount, openBookingsValue }: Props) {
  const [revenueTarget, setRevenueTarget] = useState(50000);
  const dialsPerDay = rangeDays > 0 ? metrics.dialer.dials / rangeDays : 0;
  const revPerDial = metrics.sales.firstYearValuePerDial;
  const showRate = metrics.appointmentPerformance.setter.showUpRate / 100;
  const closeRate = metrics.appointmentPerformance.setter.closeRate / 100;
  const avgDeal = metrics.appointmentPerformance.setter.averageDealValue;

  const project = (days: number) => {
    const projDials = Math.round(dialsPerDay * days);
    const projRevenue = Math.round(projDials * revPerDial);
    const projCloses = Math.round((projRevenue / Math.max(avgDeal, 1)) || 0);
    return { projDials, projRevenue, projCloses };
  };

  const p30 = useMemo(() => project(30), [dialsPerDay, revPerDial, avgDeal]);
  const p60 = useMemo(() => project(60), [dialsPerDay, revPerDial, avgDeal]);
  const p90 = useMemo(() => project(90), [dialsPerDay, revPerDial, avgDeal]);

  const pipelineExpected = Math.round(openBookingsCount * showRate * closeRate * avgDeal);

  const dialsToTarget = revPerDial > 0 ? Math.ceil(revenueTarget / revPerDial) : 0;
  const daysToTarget = dialsPerDay > 0 ? Math.ceil(dialsToTarget / dialsPerDay) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <AnalyticsKpiTile label="Dials / Day (Avg)" value={Math.round(dialsPerDay)} sublabel={`over ${rangeDays} days`} accent="primary" />
        <AnalyticsKpiTile label="$ / Dial" value={`$${revPerDial.toFixed(2)}`} sublabel="first-year value" />
        <AnalyticsKpiTile label="Show Rate" value={`${Math.round(showRate * 100)}%`} />
        <AnalyticsKpiTile label="Close Rate" value={`${Math.round(closeRate * 100)}%`} />
      </div>

      <div>
        <h3 className="mb-3 text-[10px] uppercase tracking-widest text-muted-foreground">Forward Projection</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Holding current dial volume and conversion rates constant.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            { label: "Next 30 days", data: p30 },
            { label: "Next 60 days", data: p60 },
            { label: "Next 90 days", data: p90 },
          ].map((p) => (
            <div key={p.label} className="rounded-lg border border-border bg-card p-4">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{p.label}</p>
              <p className="mt-2 font-mono text-2xl font-bold text-foreground">{aud(p.data.projRevenue)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                ~{p.data.projDials.toLocaleString()} dials · ~{p.data.projCloses} closes
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-background p-4">
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Current Pipeline (Expected Value)</h3>
          <p className="mt-2 font-mono text-2xl font-bold text-foreground">{aud(pipelineExpected)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {openBookingsCount.toLocaleString()} open bookings × {Math.round(showRate * 100)}% show × {Math.round(closeRate * 100)}% close × {aud(avgDeal)} avg
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">Booked pipeline raw value: {aud(openBookingsValue)}</p>
        </div>

        <div className="rounded-lg border border-border bg-background p-4">
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Required-Dials Calculator</h3>
          <div className="mt-3 space-y-3">
            <div>
              <Label htmlFor="rev-target" className="text-xs">Revenue target (first-year $)</Label>
              <Input
                id="rev-target"
                type="number"
                value={revenueTarget}
                onChange={(e) => setRevenueTarget(Number(e.target.value) || 0)}
                className="mt-1 font-mono"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Dials needed</p>
                <p className="font-mono text-xl font-bold text-foreground">{dialsToTarget.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Days at current pace</p>
                <p className="font-mono text-xl font-bold text-foreground">{daysToTarget > 0 ? daysToTarget : "—"}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
