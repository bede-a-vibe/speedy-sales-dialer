import { useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDurationSeconds } from "@/lib/duration";
import type { HourlyRow } from "@/lib/hourlyMetrics";

function formatHour(hour: number) {
  const suffix = hour >= 12 ? "pm" : "am";
  const h = hour % 12 || 12;
  return `${h}${suffix}`;
}

interface Props {
  rows: HourlyRow[];
}

export function HourlyBreakdownTable({ rows }: Props) {
  const peakHour = useMemo(() => {
    let max = 0;
    let peak = -1;
    for (const r of rows) {
      if (r.dials > max) {
        max = r.dials;
        peak = r.hour;
      }
    }
    return peak;
  }, [rows]);

  const activeRows = rows.filter((r) => r.dials > 0 || r.bookings > 0);

  if (activeRows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No activity recorded for this date.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[80px]">Hour</TableHead>
          <TableHead className="text-right">Dials</TableHead>
          <TableHead className="text-right">Pick Ups</TableHead>
          <TableHead className="text-right">Connections</TableHead>
          <TableHead className="text-right">Bookings</TableHead>
          <TableHead className="text-right">Talk Time</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          if (r.dials === 0 && r.bookings === 0) return null;
          const isPeak = r.hour === peakHour;
          return (
            <TableRow key={r.hour} className={isPeak ? "bg-primary/5" : undefined}>
              <TableCell className="font-medium text-foreground">
                {formatHour(r.hour)}
                {isPeak && <span className="ml-1.5 text-[10px] font-semibold uppercase text-primary">peak</span>}
              </TableCell>
              <TableCell className="text-right font-mono text-foreground">{r.dials}</TableCell>
              <TableCell className="text-right font-mono text-foreground">{r.pickUps}</TableCell>
              <TableCell className="text-right font-mono text-foreground">{r.connections}</TableCell>
              <TableCell className="text-right font-mono text-foreground">{r.bookings}</TableCell>
              <TableCell className="text-right font-mono text-muted-foreground">{formatDurationSeconds(r.talkTimeSeconds)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
