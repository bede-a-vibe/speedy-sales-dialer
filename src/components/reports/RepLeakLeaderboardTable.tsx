import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RepLeakLeaderRow } from "@/lib/repCoachingMetrics";

interface Props {
  rows: RepLeakLeaderRow[];
  repNameMap: Map<string, string>;
}

export function RepLeakLeaderboardTable({ rows, repNameMap }: Props) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No funnel data tagged for any rep yet.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Rep</TableHead>
          <TableHead>Worst Stage</TableHead>
          <TableHead className="text-right">Drop %</TableHead>
          <TableHead>Top Exit Reason</TableHead>
          <TableHead className="text-right">Dials</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.repUserId}>
            <TableCell className="font-medium text-foreground">{repNameMap.get(r.repUserId) ?? "Unnamed rep"}</TableCell>
            <TableCell className="text-sm text-foreground">{r.worstStageLabel}</TableCell>
            <TableCell className={`text-right font-mono font-semibold ${r.worstStageDropPct >= 50 ? "text-destructive" : "text-foreground"}`}>
              {r.worstStageDropPct > 0 ? `${r.worstStageDropPct}%` : "—"}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {r.topExitReasonLabel ? (
                <>
                  {r.topExitReasonLabel} <span className="text-xs">({r.topExitReasonCount})</span>
                </>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell className="text-right font-mono text-muted-foreground">{r.totalDials}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}