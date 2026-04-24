import { cn } from "@/lib/utils";
import { StatCard } from "@/components/StatCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, AlertCircle } from "lucide-react";
import type { OutboundDiagnosticMetrics } from "@/lib/reportMetrics";

type Health = "healthy" | "review" | "broken";

function healthBadge(h: Health, label: string) {
  const map = {
    healthy: { className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30", Icon: CheckCircle2 },
    review: { className: "bg-amber-500/15 text-amber-700 border-amber-500/30", Icon: AlertCircle },
    broken: { className: "bg-destructive/15 text-destructive border-destructive/30", Icon: AlertTriangle },
  } as const;
  const { className, Icon } = map[h];
  return (
    <Badge variant="outline" className={cn("mt-2 inline-flex items-center gap-1 text-[10px]", className)}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

function pickupHealth(rate: number): { h: Health; label: string } {
  if (rate < 8) return { h: "broken", label: "Below SOP floor (<8%)" };
  if (rate < 15) return { h: "review", label: "Amber (8-15%)" };
  return { h: "healthy", label: "Healthy (>15%)" };
}
function contactHealth(rate: number): { h: Health; label: string } {
  if (rate < 40) return { h: "broken", label: "Below SOP floor (<40%)" };
  if (rate < 50) return { h: "review", label: "Amber (40-50%)" };
  if (rate >= 60) return { h: "healthy", label: "Elite (>=60%)" };
  return { h: "healthy", label: "Strong (50-60%)" };
}
function uniqueDialHealth(rate: number): { h: Health; label: string } {
  if (rate < 20) return { h: "broken", label: "Over-dialing (<20%)" };
  if (rate > 70) return { h: "broken", label: "Under-following-up (>70%)" };
  if (rate >= 30 && rate <= 50) return { h: "healthy", label: "Sweet spot (30-50%)" };
  return { h: "review", label: "Outside ideal range" };
}

interface Props {
  diagnostic: OutboundDiagnosticMetrics;
  pickUpRate: number;
  repNameMap: Map<string, string>;
}

export function OutboundDiagnosticPanel({ diagnostic, pickUpRate, repNameMap }: Props) {
  const pickup = pickupHealth(pickUpRate);
  const contact = contactHealth(diagnostic.contactRate);
  const unique = uniqueDialHealth(diagnostic.uniqueDialRate);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-[10px] uppercase tracking-widest text-muted-foreground">System Health</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Pick Up Rate</p>
            <p className="mt-2 font-mono text-2xl font-bold text-foreground">{pickUpRate}%</p>
            {healthBadge(pickup.h, pickup.label)}
          </div>
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Contact Rate</p>
            <p className="mt-2 font-mono text-2xl font-bold text-foreground">{diagnostic.contactRate}%</p>
            <p className="text-[10px] text-muted-foreground">unique spoken / unique dialed</p>
            {healthBadge(contact.h, contact.label)}
          </div>
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Unique Dial Rate</p>
            <p className="mt-2 font-mono text-2xl font-bold text-foreground">{diagnostic.uniqueDialRate}%</p>
            <p className="text-[10px] text-muted-foreground">unique leads / total dials</p>
            {healthBadge(unique.h, unique.label)}
          </div>
          <StatCard label="Avg Attempts / Lead" value={diagnostic.averageAttemptsPerLead} subtext={`${diagnostic.uniqueLeadsSpokenTo} leads spoken to`} />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-4">
        <h3 className="mb-3 text-[10px] uppercase tracking-widest text-muted-foreground">Lead Age Penetration (P1-P5+)</h3>
        {diagnostic.totalLeadsInPenetration === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No attempted leads in queue.</p>
        ) : (
          <div className="space-y-2">
            {diagnostic.leadAgePenetration.map((row) => (
              <div key={row.bucket} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">
                    {row.bucket} ({row.bucket === "P5+" ? "5+ attempts" : `${row.bucket.slice(1)} attempt${row.bucket === "P1" ? "" : "s"}`})
                  </span>
                  <span className="font-mono text-foreground">
                    {row.count} <span className="text-muted-foreground">· {row.pct}%</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${row.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[10px] text-muted-foreground">
          SOP: most leads should sit at P3-P5 before disposition. Heavy P1 = under-attempted; heavy P5+ with no contact = number health issue.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-background p-4">
        <h3 className="mb-3 text-[10px] uppercase tracking-widest text-muted-foreground">Call Duration Diagnostics</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-mono text-2xl font-bold text-foreground">{diagnostic.immediateHangUps}</p>
            <p className="text-xs text-muted-foreground">immediate hang-ups</p>
            <p className="text-[10px] text-muted-foreground">{diagnostic.immediateHangUpRate}% of dials · rep-tagged</p>
          </div>
          <div>
            <p className="font-mono text-2xl font-bold text-foreground">{diagnostic.shortHangupsUnder15s}</p>
            <p className="text-xs text-muted-foreground">&lt;15s connected hangups</p>
            <p className="text-[10px] text-muted-foreground">opener problem</p>
          </div>
          <div>
            <p className="font-mono text-2xl font-bold text-foreground">{diagnostic.shortHangupsUnder2m}</p>
            <p className="text-xs text-muted-foreground">&lt;2 min connected hangups</p>
            <p className="text-[10px] text-muted-foreground">no pain established</p>
          </div>
          <div>
            <p className="font-mono text-2xl font-bold text-foreground">{diagnostic.longDqOver30m}</p>
            <p className="text-xs text-muted-foreground">&gt;30 min DQs</p>
            <p className="text-[10px] text-muted-foreground">slow disqualification</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-4">
        <h3 className="mb-3 text-[10px] uppercase tracking-widest text-muted-foreground">Per-Rep Red Flags</h3>
        {diagnostic.repRedFlags.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No rep activity in this date range.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rep</TableHead>
                <TableHead className="text-right">Dials</TableHead>
                <TableHead className="text-right">Not-Int %</TableHead>
                <TableHead className="text-right">DNC %</TableHead>
                <TableHead className="text-right">&lt;15s %</TableHead>
                <TableHead className="text-right">Hang-Up %</TableHead>
                <TableHead>Flag</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {diagnostic.repRedFlags.map((row) => (
                <TableRow key={row.repUserId}>
                  <TableCell className="font-medium text-foreground">{repNameMap.get(row.repUserId) || "Unnamed rep"}</TableCell>
                  <TableCell className="text-right font-mono text-foreground">{row.dials}</TableCell>
                  <TableCell className="text-right font-mono text-foreground">{row.notInterestedRate}%</TableCell>
                  <TableCell className="text-right font-mono text-foreground">{row.dncRate}%</TableCell>
                  <TableCell className="text-right font-mono text-foreground">{row.shortHangupRate}%</TableCell>
                  <TableCell className={cn("text-right font-mono", row.immediateHangUpRate >= 15 ? "text-destructive font-semibold" : "text-foreground")}>
                    {row.immediateHangUpRate}%
                    {row.immediateHangUps > 0 && (
                      <span className="ml-1 text-[10px] text-muted-foreground">({row.immediateHangUps})</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.flags.length === 0 ? (
                      <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 text-[10px]">
                        <CheckCircle2 className="mr-1 h-3 w-3" /> Healthy
                      </Badge>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {row.flags.map((f) => (
                          <Badge key={f} variant="outline" className="bg-amber-500/15 text-amber-700 border-amber-500/30 text-[10px]">
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            {f}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="mt-3 text-[10px] text-muted-foreground">
          Flags trigger when a rep's rate is &gt;1.5x the team average (min 10 dials). High not-int = qualification or list issue. High &lt;15s = opener review.
        </p>
      </div>
    </div>
  );
}