import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { useAdminAccess } from "@/hooks/useUserRole";
import { useMyBookings, useRateBooking, useSalesReps } from "@/hooks/usePipelineItems";
import { monthlyShowRate, showRateByRating, tally, toBookingRows, type BookingShow, type MyBookingRow, type ShowTally } from "@/lib/bookingTracker";
import { dayKeyOf } from "@/lib/funnelTracker";
import { cn } from "@/lib/utils";

const pct = (r: number | null) => (r == null ? "-" : `${Math.round(r * 100)}%`);
const fmtDay = (k: string | null) =>
  k ? new Date(`${k}T12:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "-";
const monthLabel = (m: string) => new Date(`${m}T12:00:00Z`).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });

const SHOW_LABEL: Record<BookingShow, { label: string; cls: string }> = {
  showed: { label: "Yes", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  no_show: { label: "No", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
  cancelled: { label: "Cancelled", cls: "border-border bg-muted text-muted-foreground" },
  pending: { label: "Pending", cls: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300" },
};

export function RatingStars({ value, onChange, label }: { value: number | null; onChange?: (n: number | null) => void; label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          // Clicking the current rating again clears it.
          onClick={() => onChange?.(value === n ? null : n)}
          className={cn("rounded p-0.5", onChange && "transition-transform hover:scale-110")}
          aria-label={`${n} out of 5`}
          aria-pressed={value != null && n <= value}
        >
          <Star className={n <= (value ?? 0) ? "h-3.5 w-3.5 fill-primary text-primary" : "h-3.5 w-3.5 text-muted-foreground/30"} />
        </button>
      ))}
    </span>
  );
}

function TallyCells({ t }: { t: ShowTally }) {
  return (
    <>
      <TableCell className="text-right font-mono tabular-nums">{t.total}</TableCell>
      <TableCell className="text-right font-mono tabular-nums">{t.shows}</TableCell>
      <TableCell className="text-right font-mono tabular-nums">{t.noShows}</TableCell>
      <TableCell className="text-right font-mono tabular-nums text-muted-foreground">{t.cancels}</TableCell>
      <TableCell className="text-right font-mono tabular-nums text-muted-foreground">{t.pending}</TableCell>
      <TableCell className="text-right font-mono tabular-nums">{t.reschedules}</TableCell>
      <TableCell className="text-right font-mono font-semibold tabular-nums">{pct(t.showRate)}</TableCell>
    </>
  );
}

const TALLY_HEADS = ["Booked", "Shows", "No-shows", "Cancelled", "Pending", "Rescheduled", "Show rate"];

/**
 * Pipelines > My bookings: the setter's booking tracker, built from their real
 * bookings instead of a spreadsheet. Admins and coaches can pick any setter;
 * only the setter can rate their own bookings.
 */
export function MyBookingsPanel() {
  const { user } = useAuth();
  const { canViewAdmin } = useAdminAccess();
  const { data: reps = [] } = useSalesReps();
  const [picked, setPicked] = useState<string | null>(null);
  const setterId = picked ?? user?.id;
  const own = setterId === user?.id;
  const { data, isLoading } = useMyBookings(setterId);
  const rate = useRateBooking();
  const rows = useMemo(() => (data ? toBookingRows(data.items, data.ratings) : []), [data]);
  const months = useMemo(() => monthlyShowRate(rows), [rows]);
  const byRating = useMemo(() => showRateByRating(rows), [rows]);
  const thisMonth = `${dayKeyOf(new Date().toISOString()).slice(0, 7)}-01`;
  const [month, setMonth] = useState<string>("current");
  const shownMonth = month === "current" ? thisMonth : month;
  const shownRows = rows.filter((r) => month === "all" || r.bookedOn.startsWith(shownMonth.slice(0, 7)));
  const shownTally = tally(shownRows);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{own ? "My bookings" : "Bookings"}</h3>
          <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
            Every meeting {own ? "you" : "they"} booked, whether it showed and whether it moved. Show rate is shows ÷ (shows + no-shows),
            grouped by the day booked; pending and cancelled meetings are left out so future meetings never drag it down.
            {own ? " Rate each booking 1 to 5 to see if your read on a call predicts who shows." : ""}
          </p>
        </div>
        {canViewAdmin ? (
          <Select value={setterId ?? ""} onValueChange={(v) => setPicked(v)}>
            <SelectTrigger className="h-8 w-[180px] text-xs" aria-label="Setter">
              <SelectValue placeholder="Setter" />
            </SelectTrigger>
            <SelectContent>
              {reps.map((r) => (
                <SelectItem key={r.user_id} value={r.user_id}>
                  {r.user_id === user?.id ? "Me" : r.display_name || r.email || "Unnamed"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {isLoading ? <p className="text-xs text-muted-foreground">Loading bookings...</p> : null}

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Show rate by month booked</div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  {TALLY_HEADS.map((h) => <TableHead key={h} className="text-right">{h}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {months.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-xs text-muted-foreground">No bookings in the last 12 months.</TableCell></TableRow>
                ) : months.map((m) => (
                  <TableRow key={m.month}>
                    <TableCell className="font-medium">{monthLabel(m.month)}</TableCell>
                    <TallyCells t={m} />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Show rate by {own ? "your" : "their"} rating</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rating</TableHead>
                <TableHead className="text-right">Booked</TableHead>
                <TableHead className="text-right">Sat or no-show</TableHead>
                <TableHead className="text-right">Show rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byRating.map((r) => (
                <TableRow key={String(r.rating)}>
                  <TableCell>{r.rating == null ? <span className="text-xs text-muted-foreground">Not rated</span> : <RatingStars value={r.rating} label={`${r.rating} stars`} />}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{r.total}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{r.shows + r.noShows}</TableCell>
                  <TableCell className="text-right font-mono font-semibold tabular-nums">{pct(r.showRate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Bookings · {shownTally.total} booked · {pct(shownTally.showRate)} show · {shownTally.pending} pending
          </div>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="h-8 w-[170px] text-xs" aria-label="Month booked">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">This month</SelectItem>
              {months.filter((m) => m.month !== thisMonth).map((m) => (
                <SelectItem key={m.month} value={m.month}>{monthLabel(m.month)}</SelectItem>
              ))}
              <SelectItem value="all">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date booked</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Booked for</TableHead>
                <TableHead>Did they show?</TableHead>
                <TableHead>Rescheduled?</TableHead>
                <TableHead>{own ? "My rating" : "Rating"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shownRows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-xs text-muted-foreground">No bookings in this month.</TableCell></TableRow>
              ) : shownRows.map((r: MyBookingRow) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{fmtDay(r.bookedOn)}</TableCell>
                  <TableCell>
                    <Link to={`/contacts/${r.contactId}`} className="font-medium text-foreground hover:underline">{r.company}</Link>
                    {r.person ? <span className="text-muted-foreground"> · {r.person}</span> : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{fmtDay(r.bookedFor)}</TableCell>
                  <TableCell><Badge variant="outline" className={cn("text-[10px]", SHOW_LABEL[r.show].cls)}>{SHOW_LABEL[r.show].label}</Badge></TableCell>
                  <TableCell className="text-xs">{r.rescheduled ? "Yes" : "No"}</TableCell>
                  <TableCell>
                    <RatingStars
                      value={r.rating}
                      label={`Rating for ${r.company}`}
                      onChange={own ? (n) => rate.mutate({ pipelineItemId: r.id, rating: n }) : undefined}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
