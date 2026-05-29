import { StatCard } from "@/components/StatCard";
import type { ReportMetrics } from "@/lib/reportMetrics";

interface SalesEfficiencyPanelProps {
  metrics: ReportMetrics;
}

const currency = (n: number) =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

const currencyPrecise = (n: number) =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2 });

export function SalesEfficiencyPanel({ metrics }: SalesEfficiencyPanelProps) {
  const { sales, dialer } = metrics;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard compact label="Closes" value={sales.closes} subtext="showed & closed" />
        <StatCard
          compact
          label="Dial → Sale"
          value={`${sales.dialToCloseRate}%`}
          subtext={`${sales.closes} / ${dialer.dials} dials`}
        />
        <StatCard
          compact
          label="$ / Dial (setup)"
          value={currencyPrecise(sales.revenuePerDial)}
          subtext="setup revenue / dial"
        />
        <StatCard
          compact
          label="Avg Dials / Close"
          value={sales.closes > 0 ? sales.avgDialsPerClose : "—"}
          subtext={sales.closes > 0 ? "dials per signed deal" : "no closes yet"}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard compact label="Setup Revenue" value={currency(sales.setupRevenue)} subtext="one-off cash" />
        <StatCard compact label="Monthly Recurring" value={currency(sales.monthlyRecurring)} subtext="per month" />
        <StatCard compact label="First-Year Value" value={currency(sales.firstYearValue)} subtext="setup + 12 × MRR" />
        <StatCard
          compact
          label="$ / Dial (first-year)"
          value={currencyPrecise(sales.firstYearValuePerDial)}
          subtext="including 12 mo MRR"
        />
      </div>
    </div>
  );
}