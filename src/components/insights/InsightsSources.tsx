import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { ReportSection } from "@/components/reports/ReportSection";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useSourceFunnel,
  type FunnelBasis,
  type FunnelGroup,
  type MeetingStream,
  type SourceFunnelRow,
} from "@/hooks/useMeetings";
import { cn } from "@/lib/utils";

interface Props {
  dateFrom: string;
  dateTo: string;
}

const currency = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

function pct(value: number | null) {
  return value === null || value === undefined ? "—" : `${value}%`;
}

/** Colour the rate so a bad channel is visible without reading the number. */
function rateTone(value: number | null, good: number, poor: number) {
  if (value === null || value === undefined) return "text-muted-foreground";
  if (value >= good) return "text-emerald-600 dark:text-emerald-400";
  if (value <= poor) return "text-red-600 dark:text-red-400";
  return "text-foreground";
}

export function InsightsSources({ dateFrom, dateTo }: Props) {
  const [basis, setBasis] = useState<FunnelBasis>("scheduled");
  const [group, setGroup] = useState<FunnelGroup>("channel");
  const [stream, setStream] = useState<MeetingStream | "all">("all");

  const { data: rows = [], isLoading } = useSourceFunnel({
    from: dateFrom,
    to: dateTo,
    basis,
    group,
    stream,
  });

  const totals = useMemo(() => {
    const sum = (key: keyof SourceFunnelRow) =>
      rows.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);
    const showed = sum("showed");
    const noshow = sum("noshow");
    const won = sum("contacts_won");
    const booked = sum("contacts_booked");
    const shown = sum("contacts_showed");
    return {
      meetings: sum("meetings_booked"),
      showed,
      noshow,
      pending: sum("pending"),
      upcoming: sum("upcoming"),
      won,
      mrr: sum("mrr"),
      amount: sum("total_amount"),
      showRate: showed + noshow > 0 ? Math.round((1000 * showed) / (showed + noshow)) / 10 : null,
      closeFromShow: shown > 0 ? Math.round((1000 * won) / shown) / 10 : null,
      closeFromBooked: booked > 0 ? Math.round((1000 * won) / booked) / 10 : null,
    };
  }, [rows]);

  const pendingShare =
    totals.meetings > 0 ? Math.round((100 * totals.pending) / totals.meetings) : 0;

  return (
    <div className="space-y-5">
      {/* The honesty banner. Undispositioned meetings are excluded from show rate,
          so a large pending count means these percentages describe a minority of
          meetings. Better to say so than to let someone quote a clean-looking number. */}
      {totals.pending > 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="space-y-1 text-xs">
            <p className="font-medium text-foreground">
              {totals.pending} past {totals.pending === 1 ? "meeting has" : "meetings have"} no
              outcome recorded ({pendingShare}% of meetings in this range).
            </p>
            <p className="text-muted-foreground">
              Show rate below is calculated on the {totals.showed + totals.noshow} meetings that were
              dispositioned. Clearing the queue on the{" "}
              <Link to="/meetings" className="font-medium underline underline-offset-2">
                Meetings page
              </Link>{" "}
              is what makes these numbers trustworthy.
            </p>
          </div>
        </div>
      ) : null}

      <ReportSection
        title="Show rate & close rate by lead source"
        description="Every booked meeting from both streams: GHL calendars (ads, inbound) and dialer bookings (cold outbound)."
      >
        <div className="mb-4 flex flex-wrap items-center gap-4">
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Group by
            </p>
            <ToggleGroup
              type="single"
              size="sm"
              value={group}
              onValueChange={(v) => v && setGroup(v as FunnelGroup)}
            >
              <ToggleGroupItem value="channel">Channel</ToggleGroupItem>
              <ToggleGroupItem value="source">Source</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Count by
            </p>
            <ToggleGroup
              type="single"
              size="sm"
              value={basis}
              onValueChange={(v) => v && setBasis(v as FunnelBasis)}
            >
              <ToggleGroupItem value="scheduled">Meeting date</ToggleGroupItem>
              <ToggleGroupItem value="booked">Booking date</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Stream
            </p>
            <ToggleGroup
              type="single"
              size="sm"
              value={stream}
              onValueChange={(v) => v && setStream(v as MeetingStream | "all")}
            >
              <ToggleGroupItem value="all">All</ToggleGroupItem>
              <ToggleGroupItem value="ghl">GHL</ToggleGroupItem>
              <ToggleGroupItem value="dialer">Dialer</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No meetings in this range.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{group === "source" ? "Source" : "Channel"}</TableHead>
                  <TableHead className="text-right">Booked</TableHead>
                  <TableHead className="text-right">Showed</TableHead>
                  <TableHead className="text-right">No-show</TableHead>
                  <TableHead className="text-right">Show rate</TableHead>
                  <TableHead className="text-right">Won</TableHead>
                  <TableHead className="text-right">Close / show</TableHead>
                  <TableHead className="text-right">Close / booked</TableHead>
                  <TableHead className="text-right">MRR</TableHead>
                  <TableHead className="text-right">One-off</TableHead>
                  <TableHead className="text-right">Unrecorded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={`${row.channel}-${row.source}`}>
                    <TableCell className="font-medium">
                      {group === "source" ? row.source : row.channel}
                      {row.channel === "Unattributed" ? (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          no source
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.meetings_booked}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.showed}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.noshow}</TableCell>
                    <TableCell
                      className={cn("text-right font-medium tabular-nums", rateTone(row.show_rate_pct, 60, 35))}
                    >
                      {pct(row.show_rate_pct)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.contacts_won}</TableCell>
                    <TableCell
                      className={cn("text-right font-medium tabular-nums", rateTone(row.close_from_show_pct, 30, 10))}
                    >
                      {pct(row.close_from_show_pct)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {pct(row.close_from_booked_pct)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.mrr > 0 ? currency.format(row.mrr) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.total_amount > 0 ? currency.format(row.total_amount) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {row.pending || "—"}
                    </TableCell>
                  </TableRow>
                ))}

                <TableRow className="border-t-2 font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.meetings}</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.showed}</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.noshow}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(totals.showRate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{totals.won}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(totals.closeFromShow)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(totals.closeFromBooked)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {totals.mrr > 0 ? currency.format(totals.mrr) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {totals.amount > 0 ? currency.format(totals.amount) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {totals.pending || "—"}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}

        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Show rate = showed ÷ (showed + no-show). Meetings with no recorded outcome are excluded
          from the denominator rather than counted as no-shows. Close rate counts distinct contacts
          with a signed deal dated on or after the booking, so one client with three meetings counts
          once.
        </p>
      </ReportSection>
    </div>
  );
}
