import { useMemo } from "react";
import { Link } from "react-router-dom";
import { DashboardFold } from "@/components/dashboard/DashboardFold";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { useMyBookings } from "@/hooks/usePipelineItems";
import { monthlyShowRate, showRateByRating, toBookingRows } from "@/lib/bookingTracker";
import { dayKeyOf } from "@/lib/funnelTracker";
import { RatingStars } from "@/components/bookings/MyBookingsPanel";

const pct = (r: number | null) => (r == null ? "-" : `${Math.round(r * 100)}%`);
const monthLabel = (m: string) => new Date(`${m}T12:00:00Z`).toLocaleDateString("en-AU", { month: "short", year: "numeric", timeZone: "UTC" });

/**
 * Dashboard: the signed-in setter's show rate by month booked, one line until
 * opened. The closed line still carries this month's numbers. Only shows for
 * people who have booked meetings.
 */
export function MyBookingsSection() {
  const { user } = useAuth();
  const { data } = useMyBookings(user?.id);
  const rows = useMemo(() => (data ? toBookingRows(data.items, data.ratings) : []), [data]);
  const months = useMemo(() => monthlyShowRate(rows), [rows]);
  const byRating = useMemo(() => showRateByRating(rows).filter((r) => r.rating != null), [rows]);
  if (rows.length === 0) return null;
  const thisMonth = `${dayKeyOf(new Date().toISOString()).slice(0, 7)}-01`;
  const now = months.find((m) => m.month === thisMonth);
  const summary = now
    ? `This month: ${pct(now.showRate)} show · ${now.total} booked · ${now.pending} pending`
    : "Your show rate by month booked";
  const unrated = rows.filter((r) => r.rating == null && r.bookedOn.startsWith(thisMonth.slice(0, 7))).length;

  return (
    <DashboardFold id="my-bookings" title="My bookings" summary={summary}>
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month booked</TableHead>
              <TableHead className="text-right">Booked</TableHead>
              <TableHead className="text-right">Shows</TableHead>
              <TableHead className="text-right">No-shows</TableHead>
              <TableHead className="text-right">Rescheduled</TableHead>
              <TableHead className="text-right">Show rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {months.slice(0, 4).map((m) => (
              <TableRow key={m.month}>
                <TableCell className="font-medium">{monthLabel(m.month)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{m.total}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{m.shows}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{m.noShows}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{m.reschedules}</TableCell>
                <TableCell className="text-right font-mono font-semibold tabular-nums">{pct(m.showRate)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Show rate by your rating</div>
          {byRating.length === 0 ? (
            <p className="text-xs text-muted-foreground">Rate your bookings 1 to 5 and this shows whether your read on a call predicts who shows.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {byRating.map((r) => (
                <li key={String(r.rating)} className="flex items-center justify-between gap-2">
                  <RatingStars value={r.rating} label={`${r.rating} stars`} />
                  <span className="text-muted-foreground">{r.total} booked</span>
                  <span className="w-12 text-right font-mono font-semibold tabular-nums">{pct(r.showRate)}</span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/pipelines?tab=mine" className="inline-block text-xs font-medium text-primary underline-offset-2 hover:underline">
            {unrated > 0 ? `Rate ${unrated} unrated booking${unrated === 1 ? "" : "s"} this month` : "See every booking"}
          </Link>
        </div>
      </div>
    </DashboardFold>
  );
}
