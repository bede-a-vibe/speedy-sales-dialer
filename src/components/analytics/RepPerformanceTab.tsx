import { useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDurationSeconds } from "@/lib/duration";
import { getRepPerformance, type RepPerformanceRow } from "@/lib/analyticsMetrics";

const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const audP = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2 });

interface Props {
  callLogs: any[];
  bookings: any[];
  reps: { user_id: string; display_name: string | null; email: string | null }[];
  from: string;
  to: string;
}

type SortKey = keyof RepPerformanceRow;

const COLUMNS: { key: SortKey; label: string; format: (r: RepPerformanceRow) => string | number; align?: "right" }[] = [
  { key: "dials", label: "Dials", format: (r) => r.dials.toLocaleString(), align: "right" },
  { key: "talkTimeSeconds", label: "Talk", format: (r) => formatDurationSeconds(r.talkTimeSeconds), align: "right" },
  { key: "conversations", label: "Conv", format: (r) => r.conversations, align: "right" },
  { key: "bookings", label: "Book", format: (r) => r.bookings, align: "right" },
  { key: "showed", label: "Showed", format: (r) => r.showed, align: "right" },
  { key: "closed", label: "Closed", format: (r) => r.closed, align: "right" },
  { key: "dialToCloseRate", label: "Dial→Close", format: (r) => `${r.dialToCloseRate}%`, align: "right" },
  { key: "dialsPerClose", label: "Dials/Close", format: (r) => (r.closed > 0 ? r.dialsPerClose : "—"), align: "right" },
  { key: "revenuePerDial", label: "$/Dial", format: (r) => audP(r.revenuePerDial), align: "right" },
  { key: "setupRevenue", label: "Setup $", format: (r) => aud(r.setupRevenue), align: "right" },
  { key: "mrr", label: "MRR $", format: (r) => aud(r.mrr), align: "right" },
  { key: "firstYearValue", label: "First-Year $", format: (r) => aud(r.firstYearValue), align: "right" },
];

export function RepPerformanceTab({ callLogs, bookings, reps, from, to }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("dials");
  const [desc, setDesc] = useState(true);

  const rows = useMemo(() => getRepPerformance(callLogs, bookings, from, to), [callLogs, bookings, from, to]);
  const repName = useMemo(
    () => new Map(reps.map((r) => [r.user_id, r.display_name || r.email || "Unnamed"])),
    [reps],
  );

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return desc ? bv - av : av - bv;
    });
    return arr;
  }, [rows, sortKey, desc]);

  // top performer per column
  const tops = useMemo(() => {
    const t: Partial<Record<SortKey, string>> = {};
    for (const col of COLUMNS) {
      let bestId: string | undefined;
      let bestVal = -Infinity;
      for (const r of rows) {
        const v = r[col.key] as number;
        if (v > bestVal) { bestVal = v; bestId = r.repUserId; }
      }
      if (bestVal > 0 && bestId) t[col.key] = bestId;
    }
    return t;
  }, [rows]);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setDesc((d) => !d);
    else { setSortKey(k); setDesc(true); }
  };

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="mb-3">
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Rep Leaderboard</h3>
        <p className="mt-1 text-xs text-muted-foreground">Click any column to sort. Crown marks the top performer.</p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 min-w-[180px] bg-background">Rep</TableHead>
              {COLUMNS.map((c) => (
                <TableHead key={c.key} className="text-right">
                  <Button variant="ghost" size="sm" className="h-7 px-1 text-xs" onClick={() => toggleSort(c.key)}>
                    {c.label}
                    <ArrowUpDown className={cn("ml-1 h-3 w-3 opacity-50", sortKey === c.key && "opacity-100 text-primary")} />
                  </Button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow><TableCell colSpan={COLUMNS.length + 1} className="text-center text-sm text-muted-foreground">No rep data.</TableCell></TableRow>
            ) : (
              sorted.map((r) => (
                <TableRow key={r.repUserId}>
                  <TableCell className="sticky left-0 z-10 bg-background font-medium text-foreground">
                    {repName.get(r.repUserId) || "Unnamed"}
                  </TableCell>
                  {COLUMNS.map((c) => {
                    const isTop = tops[c.key] === r.repUserId && (r[c.key] as number) > 0;
                    return (
                      <TableCell key={c.key} className={cn("text-right font-mono text-sm", isTop && "text-primary font-semibold")}>
                        <span className="inline-flex items-center justify-end gap-1">
                          {isTop && <Crown className="h-3 w-3" />}
                          {c.format(r)}
                        </span>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
