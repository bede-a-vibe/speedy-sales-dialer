import { EndToEndFunnel } from "@/components/funnel/EndToEndFunnel";
import { AnalyticsKpiTile } from "./AnalyticsKpiTile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ReportMetrics } from "@/lib/reportMetrics";
import type { FunnelMetrics } from "@/lib/funnelMetrics";
import { useMemo, useState } from "react";
import { getSegmentRows, SEGMENT_DIMENSIONS, type SegmentDimensionKey } from "@/lib/analyticsMetrics";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  metrics: ReportMetrics;
  funnel: FunnelMetrics;
  callLogs: any[];
  bookings: any[];
  from: string;
  to: string;
}

export function FunnelTab({ metrics, funnel, callLogs, bookings, from, to }: Props) {
  const [dim, setDim] = useState<SegmentDimensionKey>("industry");
  const rows = useMemo(() => getSegmentRows(callLogs, bookings, dim, from, to), [callLogs, bookings, dim, from, to]);

  const dial = metrics.dialer.dials;
  const conv = metrics.dialer.conversations;
  const bookingsCount = metrics.bookingsMade.totalBookingsMade;
  const showed = metrics.appointmentPerformance.setter.showed;
  const closed = metrics.appointmentPerformance.setter.showedClosed;

  const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : "—");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <AnalyticsKpiTile label="Dial → Conv" value={pct(conv, dial)} sublabel={`${conv}/${dial}`} />
        <AnalyticsKpiTile label="Conv → Book" value={pct(bookingsCount, conv)} sublabel={`${bookingsCount}/${conv}`} />
        <AnalyticsKpiTile label="Book → Show" value={pct(showed, bookingsCount)} sublabel={`${showed}/${bookingsCount}`} />
        <AnalyticsKpiTile label="Show → Close" value={pct(closed, showed)} accent="success" sublabel={`${closed}/${showed}`} />
        <AnalyticsKpiTile label="Dial → Close" value={pct(closed, dial)} accent="success" sublabel={`${closed}/${dial}`} />
      </div>

      <EndToEndFunnel metrics={metrics} funnel={funnel} />

      <div className="rounded-lg border border-border bg-background p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Funnel by Segment</h3>
            <p className="mt-1 text-xs text-muted-foreground">Same funnel sliced by your chosen dimension.</p>
          </div>
          <Select value={dim} onValueChange={(v) => setDim(v as SegmentDimensionKey)}>
            <SelectTrigger className="w-[180px] border-border bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEGMENT_DIMENSIONS.map((d) => (
                <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Segment</TableHead>
                <TableHead className="text-right">Dials</TableHead>
                <TableHead className="text-right">Conv</TableHead>
                <TableHead className="text-right">Contact %</TableHead>
                <TableHead className="text-right">Bookings</TableHead>
                <TableHead className="text-right">Book %</TableHead>
                <TableHead className="text-right">Showed</TableHead>
                <TableHead className="text-right">Closed</TableHead>
                <TableHead className="text-right">Close %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground">No data.</TableCell></TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="text-sm font-medium text-foreground">{r.label}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{r.dials.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{r.conversations}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">{r.contactRate}%</TableCell>
                    <TableCell className="text-right font-mono text-sm">{r.bookings}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">{r.bookingRate}%</TableCell>
                    <TableCell className="text-right font-mono text-sm">{r.showed}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{r.closed}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">{r.closeRate}%</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
