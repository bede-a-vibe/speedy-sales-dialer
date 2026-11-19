/**
 * A setter's own booking tracker (from Ben's "booking show rate tracker" sheet,
 * 19 Nov 2026): one row per booking they made, whether it showed, whether it
 * moved, their own 1 to 5 rating, and the show rate by month booked.
 *
 * Show rate = shows ÷ (shows + no-shows), the sheet's formula. Pending
 * (still upcoming) and cancelled bookings are left out of it, so future
 * meetings never drag the rate down. Outcomes come from the booking's
 * resolved_bucket, the same rule every other report uses for attendance.
 */
import { dayKeyOf } from "@/lib/funnelTracker";

export type BookingShow = "showed" | "no_show" | "cancelled" | "pending";

export interface MyBookingSource {
  id: string;
  contact_id: string;
  created_at: string;
  scheduled_for: string | null;
  resolved_bucket: string | null;
  reschedule_count: number | null;
  move_count: number | null;
  contacts: { business_name: string | null; contact_person: string | null } | null;
}

export interface MyBookingRow {
  id: string;
  contactId: string;
  company: string;
  person: string | null;
  bookedOn: string;
  bookedFor: string | null;
  show: BookingShow;
  rescheduled: boolean;
  rating: number | null;
}

export function showOf(bucket: string | null | undefined): BookingShow {
  if (bucket === "showed") return "showed";
  if (bucket === "noshow") return "no_show";
  if (bucket === "cancelled") return "cancelled";
  return "pending";
}

export function toBookingRows(items: MyBookingSource[], ratings: Map<string, number>): MyBookingRow[] {
  return items
    .map((p) => ({
      id: p.id,
      contactId: p.contact_id,
      company: p.contacts?.business_name?.trim() || "Unnamed business",
      person: p.contacts?.contact_person?.trim() || null,
      bookedOn: dayKeyOf(p.created_at),
      bookedFor: p.scheduled_for ? dayKeyOf(p.scheduled_for) : null,
      show: showOf(p.resolved_bucket),
      rescheduled: (p.reschedule_count ?? 0) > 0 || (p.move_count ?? 0) > 0,
      rating: ratings.get(p.id) ?? null,
    }))
    .sort((a, b) => b.bookedOn.localeCompare(a.bookedOn) || a.company.localeCompare(b.company));
}

export interface ShowTally {
  total: number;
  shows: number;
  noShows: number;
  cancels: number;
  pending: number;
  reschedules: number;
  /** shows ÷ (shows + no-shows); null until one has happened. */
  showRate: number | null;
}

export function tally(rows: MyBookingRow[]): ShowTally {
  const t = { total: rows.length, shows: 0, noShows: 0, cancels: 0, pending: 0, reschedules: 0 };
  for (const r of rows) {
    if (r.show === "showed") t.shows += 1;
    else if (r.show === "no_show") t.noShows += 1;
    else if (r.show === "cancelled") t.cancels += 1;
    else t.pending += 1;
    if (r.rescheduled) t.reschedules += 1;
  }
  const sat = t.shows + t.noShows;
  return { ...t, showRate: sat > 0 ? t.shows / sat : null };
}

/** Month booked (YYYY-MM-01), newest first, only months with bookings. */
export function monthlyShowRate(rows: MyBookingRow[]): Array<{ month: string } & ShowTally> {
  const byMonth = new Map<string, MyBookingRow[]>();
  for (const r of rows) {
    const m = `${r.bookedOn.slice(0, 7)}-01`;
    byMonth.set(m, [...(byMonth.get(m) ?? []), r]);
  }
  return [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, list]) => ({ month, ...tally(list) }));
}

/** Does the setter's own rating predict who shows? One line per rating, then unrated. */
export function showRateByRating(rows: MyBookingRow[]): Array<{ rating: number | null } & ShowTally> {
  const out: Array<{ rating: number | null } & ShowTally> = [];
  for (const rating of [5, 4, 3, 2, 1, null]) {
    const list = rows.filter((r) => r.rating === rating);
    if (list.length) out.push({ rating, ...tally(list) });
  }
  return out;
}
