import { DollarSign, Target, CalendarCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Commission structure and role standards, verbatim from the setter agreement
 * (Schedule 2 KPIs + commission clauses). Update here if the agreement changes.
 */

const COMMISSION_TIERS = [
  { deals: "Fewer than 10", revenue: "Under $18,000", rate: "Nil" },
  { deals: "10 to 15", revenue: "$18,000 – $27,999", rate: "15%" },
  { deals: "16 to 20", revenue: "$28,000 – $37,999", rate: "18%" },
  { deals: "21 to 25", revenue: "$38,000 – $47,999", rate: "21%" },
  { deals: "26 or more", revenue: "$48,000 or more", rate: "25%" },
];

const RAMP_ROWS = [
  { measure: "Productive dialling (hrs/day)", d1: "4", m1: "7.5", m2: "7.5", m3: "7.5", steady: "7.5" },
  { measure: "Bookings per productive hour", d1: "—", m1: "0.33", m2: "0.47", m3: "0.72", steady: "0.90" },
  { measure: "Minimum to pass the period", d1: "—", m1: "0.25", m2: "0.35", m3: "0.55", steady: "0.65" },
  { measure: "Show rate", d1: "—", m1: "20%", m2: "28%", m3: "35%", steady: "40%" },
  { measure: "Pickups reaching problem awareness", d1: "—", m1: "10%", m2: "16%", m3: "21%", steady: "25%" },
  { measure: "Pickups reaching commitment", d1: "—", m1: "4%", m2: "7%", m3: "10%", steady: "12%" },
];

const DAILY_STANDARDS = [
  "7.5 hours of productive dialling logged",
  "Every dial dispositioned in the CRM the same day",
  "Every conversation's stage and drop-off reason recorded",
  "Every booked meeting confirmed the day before and the morning of",
  "New bookings confirmed at the time of booking",
];

export function CommissionPanel() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="h-5 w-5 text-primary" />
          Pay &amp; targets
        </CardTitle>
        <CardDescription>
          How your commission works and the numbers you're held to as you ramp.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="mb-2 text-[10px] font-mono uppercase tracking-widest text-primary">
            Retainer commission — on first-month retainer revenue
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-1.5 pr-3 font-medium">Deals closed in the month</th>
                  <th className="pb-1.5 pr-3 font-medium">Or first-month revenue</th>
                  <th className="pb-1.5 font-medium">Rate</th>
                </tr>
              </thead>
              <tbody>
                {COMMISSION_TIERS.map((t) => (
                  <tr key={t.deals} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5 pr-3">{t.deals}</td>
                    <td className="py-1.5 pr-3">{t.revenue}</td>
                    <td className="py-1.5 font-mono font-semibold">{t.rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            You get whichever tier is higher — deals closed or first-month revenue — fixed at month end.
            Project work pays a flat 5% of fees collected; deals from company advertising pay a flat 5% of
            first-month revenue.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-primary">
            <Target className="h-3.5 w-3.5" /> Your ramp targets
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-1.5 pr-3 font-medium">Measure</th>
                  <th className="pb-1.5 pr-3 font-medium">Day 1</th>
                  <th className="pb-1.5 pr-3 font-medium">Days 1–30</th>
                  <th className="pb-1.5 pr-3 font-medium">31–60</th>
                  <th className="pb-1.5 pr-3 font-medium">61–90</th>
                  <th className="pb-1.5 font-medium">Day 91+</th>
                </tr>
              </thead>
              <tbody>
                {RAMP_ROWS.map((r) => (
                  <tr key={r.measure} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5 pr-3">{r.measure}</td>
                    <td className="py-1.5 pr-3 font-mono tabular-nums">{r.d1}</td>
                    <td className="py-1.5 pr-3 font-mono tabular-nums">{r.m1}</td>
                    <td className="py-1.5 pr-3 font-mono tabular-nums">{r.m2}</td>
                    <td className="py-1.5 pr-3 font-mono tabular-nums">{r.m3}</td>
                    <td className="py-1.5 font-mono tabular-nums font-semibold">{r.steady}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-primary">
            <CalendarCheck className="h-3.5 w-3.5" /> Required every working day
          </p>
          <ul className="space-y-1">
            {DAILY_STANDARDS.map((s) => (
              <li key={s} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                {s}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Commission is calculated on cash collected in the calendar month and paid at month end. Deals with a
            30-day money-back guarantee are held until the guarantee expires. If a payment is refunded or charged
            back, that deal's commission is reversed against the following month — it never touches your base
            salary, super or leave.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
