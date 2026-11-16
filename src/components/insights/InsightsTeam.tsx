import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpDown, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ReportSection } from "@/components/reports/ReportSection";
import { RepCoachingPanel } from "@/components/reports/RepCoachingPanel";
import { TeamCoachingPanel } from "@/components/insights/TeamCoachingPanel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDurationSeconds } from "@/lib/duration";
import { getRepPerformance, type RepPerformanceRow } from "@/lib/analyticsMetrics";
import { computeAllRepScorecards, computeRepCoachingScorecard, scorecardBookings } from "@/lib/repCoachingMetrics";

interface Props {
  callLogs: any[];
  bookings: any[];
  reps: { user_id: string; display_name: string | null; email: string | null }[];
  dateFrom: string;
  dateTo: string;
  activeRepId?: string;
  selectedRepLabel?: string;
  repNameMap: Map<string, string>;
}

/** Local calendar day, the same day key the leaderboard and the rest of Insights use. */
function localDateKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * created_by on each lead's first booking, from full history: a close on a
 * second meeting is credited to whoever set the lead, and that first booking is
 * often before the window.
 */
function useFirstSetterByContact(contactIds: string[]) {
  const key = [...contactIds].sort().join(",");
  return useQuery({
    queryKey: ["first-setter-by-contact", key],
    enabled: contactIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const map = new Map<string, string>();
      const firstAt = new Map<string, string>();
      for (let i = 0; i < contactIds.length; i += 200) {
        const { data, error } = await supabase
          .from("pipeline_items")
          .select("id, contact_id, created_at, created_by")
          .eq("pipeline_type", "booked")
          .in("contact_id", contactIds.slice(i, i + 200))
          .order("created_at", { ascending: true })
          .order("id", { ascending: true });
        if (error) throw error;
        for (const row of data ?? []) {
          if (!row.contact_id || !row.created_at || !row.created_by) continue;
          const seen = firstAt.get(row.contact_id);
          if (!seen || row.created_at < seen) {
            firstAt.set(row.contact_id, row.created_at);
            map.set(row.contact_id, row.created_by);
          }
        }
      }
      return map;
    },
  });
}

const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const audP = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2 });

type SortKey = keyof RepPerformanceRow;

const COLUMNS: { key: SortKey; label: string; hint?: string; format: (r: RepPerformanceRow) => string | number }[] = [
  { key: "dials", label: "Dials", format: (r) => r.dials.toLocaleString() },
  { key: "dialsPerHour", label: "Dials/Hr", format: (r) => (r.activeHours > 0 ? r.dialsPerHour.toFixed(1) : "—") },
  { key: "activeHours", label: "Active Hrs", format: (r) => (r.activeHours > 0 ? r.activeHours : "—") },
  { key: "talkTimeSeconds", label: "Talk", format: (r) => formatDurationSeconds(r.talkTimeSeconds) },
  { key: "conversations", label: "Conv", format: (r) => r.conversations },
  { key: "bookings", label: "Book", hint: "First meetings booked in the range (setter). Second meetings left out.", format: (r) => r.bookings },
  { key: "showed", label: "Showed (first mtg)", hint: "First meetings this rep set that sat, by meeting day.", format: (r) => r.showed },
  { key: "closed", label: "Closed (setter)", hint: "Closes credited to whoever made the lead's first booking.", format: (r) => r.closed },
  { key: "dialToCloseRate", label: "Dial→Close", format: (r) => `${r.dialToCloseRate}%` },
  { key: "dialsPerClose", label: "Dials/Close", format: (r) => (r.closed > 0 ? r.dialsPerClose : "—") },
  { key: "revenuePerDial", label: "$/Dial (first coll.)", hint: "First collection on the setter's closes ÷ dials.", format: (r) => audP(r.revenuePerDial) },
  { key: "setupRevenue", label: "Setup $", format: (r) => aud(r.setupRevenue) },
  { key: "mrr", label: "MRR $", format: (r) => aud(r.mrr) },
  { key: "firstCollection", label: "First collection $", hint: "One-off / setup fee plus the first retainer month.", format: (r) => aud(r.firstCollection) },
  { key: "closerSat", label: "Sat (closer)", hint: "Meetings this rep ran (assigned closer) that sat, first and second.", format: (r) => r.closerSat },
  { key: "closerClosed", label: "Closed (closer)", hint: "Closes on meetings this rep ran.", format: (r) => r.closerClosed },
  { key: "closerMrr", label: "MRR (closer)", hint: "MRR won on meetings this rep ran.", format: (r) => aud(r.closerMrr) },
];

function RepLeaderboard({ rows, repName }: { rows: RepPerformanceRow[]; repName: Map<string, string> }) {
  const [sortKey, setSortKey] = useState<SortKey>("dials");
  const [desc, setDesc] = useState(true);

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return desc ? bv - av : av - bv;
    });
    return arr;
  }, [rows, sortKey, desc]);

  // Top performer per column (only meaningful with more than one row).
  const tops = useMemo(() => {
    const t: Partial<Record<SortKey, string>> = {};
    if (rows.length < 2) return t;
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
      <p className="mb-3 text-xs text-muted-foreground">
        Click any column to sort. Crown marks the top performer. Setter columns credit the rep who booked the lead; closer columns credit the rep who ran the meeting.
      </p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 min-w-[180px] bg-background">Rep</TableHead>
              {COLUMNS.map((c) => (
                <TableHead key={c.key} className="text-right" title={c.hint}>
                  <Button variant="ghost" size="sm" className="h-7 px-1 text-xs whitespace-nowrap" onClick={() => toggleSort(c.key)}>
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

/**
 * Insights → Team: ONE sortable leaderboard + ONE coaching section.
 * (Previously two overlapping leaderboards + three coaching surfaces across tabs.)
 */
export function InsightsTeam({ callLogs, bookings, reps, dateFrom, dateTo, activeRepId, selectedRepLabel, repNameMap }: Props) {
  const windowBookings = useMemo(() => scorecardBookings(bookings, dateFrom, dateTo), [bookings, dateFrom, dateTo]);

  const repScorecards = useMemo(() => {
    if (activeRepId) {
      return [computeRepCoachingScorecard(activeRepId, callLogs as never, windowBookings)];
    }
    const repIds = Array.from(
      new Set([
        ...callLogs.map((l) => l.user_id).filter(Boolean),
        ...windowBookings.map((b) => b.created_by).filter(Boolean),
      ]),
    );
    return computeAllRepScorecards(repIds, callLogs as never, windowBookings);
  }, [activeRepId, callLogs, windowBookings]);

  // Leads that closed in the range: look up who set them (first booking, full history).
  const closedContactIds = useMemo(
    () =>
      Array.from(
        new Set(
          bookings
            .filter((b) => b.appointment_outcome === "showed_closed" && b.scheduled_for && !b.is_reschedule_slot)
            .filter((b) => {
              const k = localDateKey(b.scheduled_for);
              return k >= dateFrom && k <= dateTo;
            })
            .map((b) => b.contact_id as string)
            .filter(Boolean),
        ),
      ),
    [bookings, dateFrom, dateTo],
  );
  const { data: firstSetterByContact } = useFirstSetterByContact(closedContactIds);

  const leaderboardRows = useMemo(() => {
    const rows = getRepPerformance(callLogs, bookings, dateFrom, dateTo, firstSetterByContact);
    return activeRepId ? rows.filter((r) => r.repUserId === activeRepId) : rows;
  }, [callLogs, bookings, dateFrom, dateTo, firstSetterByContact, activeRepId]);

  const repName = useMemo(
    () => new Map(reps.map((r) => [r.user_id, r.display_name || r.email || "Unnamed"])),
    [reps],
  );

  return (
    <div className="space-y-5">
      <ReportSection
        title="Rep Leaderboard"
        description={
          activeRepId
            ? `${selectedRepLabel ?? "Selected rep"} only, in the selected range.`
            : "All reps: sortable outbound performance per rep in the selected range."
        }
      >
        <RepLeaderboard rows={leaderboardRows} repName={repName} />
      </ReportSection>

      <ReportSection
        title="Per-Rep Coaching Scorecards"
        description={
          activeRepId
            ? `Where ${selectedRepLabel ?? "this rep"}'s calls fall apart, plus best pick-up and booking windows.`
            : "One scorecard per rep: biggest funnel leak, top exit reason, and timing intelligence. Sorted by dial volume."
        }
      >
        <RepCoachingPanel scorecards={repScorecards} repNameMap={repNameMap} expanded={!!activeRepId} />
      </ReportSection>

      <TeamCoachingPanel dateFrom={dateFrom} dateTo={dateTo} activeRepId={activeRepId} selectedRepLabel={selectedRepLabel} />
    </div>
  );
}
