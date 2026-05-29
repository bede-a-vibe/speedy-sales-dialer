import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SEGMENT_DIMENSIONS, getSegmentRows, type SegmentDimensionKey } from "@/lib/analyticsMetrics";

const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

interface Props {
  callLogs: any[];
  bookings: any[];
  from: string;
  to: string;
}

export function SourcesTab({ callLogs, bookings, from, to }: Props) {
  const [dim, setDim] = useState<SegmentDimensionKey>("industry");
  const rows = useMemo(() => getSegmentRows(callLogs, bookings, dim, from, to), [callLogs, bookings, dim, from, to]);

  return (
    <div className="space-y-4">
      <Tabs value={dim} onValueChange={(v) => setDim(v as SegmentDimensionKey)}>
        <TabsList className="h-auto flex-wrap">
          {SEGMENT_DIMENSIONS.map((d) => (
            <TabsTrigger key={d.key} value={d.key} className="text-xs">{d.label}</TabsTrigger>
          ))}
        </TabsList>
        {SEGMENT_DIMENSIONS.map((d) => (
          <TabsContent key={d.key} value={d.key}>
            <div className="rounded-lg border border-border bg-background p-4">
              <h3 className="mb-3 text-[10px] uppercase tracking-widest text-muted-foreground">Performance by {d.label}</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{d.label}</TableHead>
                      <TableHead className="text-right">Dials</TableHead>
                      <TableHead className="text-right">Contact %</TableHead>
                      <TableHead className="text-right">Bookings</TableHead>
                      <TableHead className="text-right">Book %</TableHead>
                      <TableHead className="text-right">Closed</TableHead>
                      <TableHead className="text-right">Setup $</TableHead>
                      <TableHead className="text-right">MRR</TableHead>
                      <TableHead className="text-right">First-Year $</TableHead>
                      <TableHead className="text-right">$ / Dial</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 ? (
                      <TableRow><TableCell colSpan={10} className="text-center text-sm text-muted-foreground">No data.</TableCell></TableRow>
                    ) : (
                      rows.map((r) => (
                        <TableRow key={r.key}>
                          <TableCell className="text-sm font-medium text-foreground">{r.label}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{r.dials.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground">{r.contactRate}%</TableCell>
                          <TableCell className="text-right font-mono text-sm">{r.bookings}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground">{r.bookingRate}%</TableCell>
                          <TableCell className="text-right font-mono text-sm">{r.closed}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{r.setupRevenue > 0 ? aud(r.setupRevenue) : "—"}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{r.mrr > 0 ? aud(r.mrr) : "—"}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold text-foreground">{r.firstYearValue > 0 ? aud(r.firstYearValue) : "—"}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-muted-foreground">${r.revenuePerDial.toFixed(2)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
