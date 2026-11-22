import { Fragment, useCallback, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ReportSection } from "@/components/reports/ReportSection";
import type { BookedAppointmentReportItem } from "@/hooks/usePipelineItems";
import { cn } from "@/lib/utils";
import { isOurReschedule, isProspectReschedule } from "@/lib/appointments";
import { movesOf, wasPitched as sharedWasPitched } from "@/lib/reportMetrics";
import { useNewClients } from "@/hooks/useNewClients";
import {
  availableSlotsForDay,
  bookingTierOf,
  creditNewClients,
  daysBetween,
  defaultMonthOpen,
  defaultWeekOpen,
  matchesTier,
  monthOf,
  weekKey,
  weeksOf,
  type TierFilter,
} from "@/lib/funnelTracker";
import { useContactBookingHistory } from "@/hooks/useFunnelTracker";

/**
 * The IWB "Elites Closing" tracker, rebuilt on the dialer's own bookings, laid out like
 * the Tracker tab: one row per day, Sunday-to-Saturday week totals and month totals that
 * collapse, a total for the range, and the metrics across the top. Every row is derived from
 * pipeline_items on Bede's definitions (showed over resolved slots, first meetings for the
 * setting rates, closed over pitched for the close rates, first collection for cash).
 * Rows the dialer cannot see yet (GMeet time, deposits vs paid-in-full) are not faked.
 */

interface Props {
  dateFrom: string;
  dateTo: string;
  bookings: BookedAppointmentReportItem[];
  /** Missed slots of moved meetings: counted as rescheduled on the day they were missed, never as bookings. */
  rescheduleSlots?: BookedAppointmentReportItem[];
  activeRepId?: string;
  selectedRepLabel?: string;
}

type Item = BookedAppointmentReportItem;

const TZ = "Australia/Melbourne";
const SHOWED = new Set(["showed_closed", "showed_no_close", "showed_verbal_commitment", "second_meeting_booked", "no_close_follow_up", "disqualified"]);
const PITCHED = new Set(["showed_closed", "showed_no_close", "showed_verbal_commitment", "no_close_follow_up"]);

/**
 * Was the offer pitched? The closer's Pitched / Not pitched answer wins
 * (pipeline_items.pitched, from 16 Nov 2026). Older rows have no answer, so
 * fall back to the outcome: a close decision recorded means it was pitched.
 */
function wasPitched(i: Item) {
  return sharedWasPitched(i);
}
const NO_CLOSE = new Set(["showed_no_close", "no_close_follow_up"]);
/** Pitched, not closed, and the next step is still open: no objection is recorded on these. */
const VERBAL_OR_SECOND = new Set(["showed_verbal_commitment", "second_meeting_booked"]);
/** Bucket for reason keys that have no label, so the breakdown rows add up to their total. */
export const UNMAPPED = "__unmapped";
const hasLabel = (labels: Record<string, string>, key: string) => Object.prototype.hasOwnProperty.call(labels, key);
const RESOLVED = new Set(["showed", "noshow", "cancelled", "rescheduled"]);

const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });

function addDays(key: string, n: number) {
  const d = new Date(`${key}T12:00:00+10:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtDay(key: string) {
  const d = new Date(`${key}T12:00:00Z`);
  return `${d.toLocaleDateString("en-AU", { weekday: "short", timeZone: "UTC" })} ${d.getUTCDate()} ${d.toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" })}`;
}
function fmtMonth(month: string) {
  const d = new Date(`${month}T12:00:00Z`);
  return `${d.toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" })} ${d.getUTCFullYear()}`;
}
/** "Week 1–7 Nov", or "Week 30 Nov" for a one-day week. */
function fmtWeek(from: string, to: string) {
  const dayMonth = (k: string) => fmtDay(k).split(" ").slice(1).join(" ");
  return from === to ? `Week ${dayMonth(to)}` : `Week ${Number(from.slice(8, 10))}–${dayMonth(to)}`;
}

const OPEN_STORAGE_KEY = "insights-closing-open-v1";
function readOpenState(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(OPEN_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}
function writeOpenState(state: Record<string, boolean>) {
  try {
    window.localStorage.setItem(OPEN_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private window or blocked storage: the open state just is not remembered.
  }
}

// Bede's bookable calendar lives in lib/funnelTracker so the Tracker tab shares it.
export { availableSlotsForDay };

interface Stats {
  availableSlots: number;
  booked: number;
  newClients: number;
  newClientsMrr: number;
  secondBooked: number;
  due: number;
  resolved: number;
  showed: number;
  showedFirst: number;
  showedFollow: number;
  noShow: number;
  cancelled: number;
  rescheduled: number;
  firstResolved: number;
  firstNoShow: number;
  firstCancelled: number;
  firstRescheduled: number;
  /** First meetings that had been moved before, resolved on the day they finally happened. */
  movedResolved: number;
  movedShowed: number;
  neverMovedResolved: number;
  neverMovedShowed: number;
  /** Missed first-meeting slots by who moved them. */
  movedByProspect: number;
  movedByUs: number;
  movedPhoneCall: number;
  /** Cancelled first meetings by cx_* reason. */
  cxReasons: Record<string, number>;
  followResolved: number;
  doubleBooked: number;
  meetingMinutes: number;
  qualifiedLive: number;
  /** Sat and marked not qualified. Unmarked sittings are in neither count. */
  notQualifiedLive: number;
  pitched: number;
  pitchedFirst: number;
  pitchedFollow: number;
  pitchedQualified: number;
  closedQualified: number;
  satNotPitched: number;
  proposalsSent: number;
  proposalsOwed: number;
  notClosed: number;
  /** Pitched, not closed, verbal commitment or second meeting booked (no objection on these). */
  notClosedVerbal: number;
  obj: Record<string, number>;
  dq: number;
  dqReasons: Record<string, number>;
  closed: number;
  closedFirst: number;
  closedFollow: number;
  verbal: number;
  retainerDeals: number;
  oneOffDeals: number;
  cash: number;
  mrr: number;
  oneOff: number;
}

function emptyStats(): Stats {
  return {
    availableSlots: 0, booked: 0, newClients: 0, newClientsMrr: 0, secondBooked: 0, due: 0, resolved: 0, showed: 0, showedFirst: 0, showedFollow: 0, noShow: 0, cancelled: 0, rescheduled: 0,
    firstResolved: 0, firstNoShow: 0, firstCancelled: 0, firstRescheduled: 0,
    movedResolved: 0, movedShowed: 0, neverMovedResolved: 0, neverMovedShowed: 0, movedByProspect: 0, movedByUs: 0, movedPhoneCall: 0, cxReasons: {},
    followResolved: 0, doubleBooked: 0, meetingMinutes: 0,
    qualifiedLive: 0, notQualifiedLive: 0, pitched: 0, pitchedFirst: 0, pitchedFollow: 0, pitchedQualified: 0, closedQualified: 0, satNotPitched: 0, proposalsSent: 0, proposalsOwed: 0, notClosed: 0, notClosedVerbal: 0, obj: {}, dq: 0, dqReasons: {},
    closed: 0, closedFirst: 0, closedFollow: 0, verbal: 0, retainerDeals: 0, oneOffDeals: 0, cash: 0, mrr: 0, oneOff: 0,
  };
}

/**
 * `items` are the meetings in view by closer (assigned_user_id). `bookedItems`
 * feed "Bookings made" only, which is a setter number (created_by), the same as
 * every other tab. With no rep filter the two lists are the same.
 */
export function computeStats(
  items: Item[],
  days: Set<string>,
  minutesByItem: Map<string, number>,
  bookedItems: Item[] = items,
): Stats {
  const s = emptyStats();
  for (const d of days) s.availableSlots += availableSlotsForDay(d);
  const dueAll = items.filter((i) => i.scheduled_for && days.has(dayKey(i.scheduled_for)));
  const due = dueAll.filter((i) => !i.is_reschedule_slot);
  // First meetings only, same as Bookings Made on the Funnel and Overview tabs;
  // a second meeting booked by the closer is counted on its own row.
  const madeInRange = bookedItems.filter((i) => !i.is_reschedule_slot && i.created_at && days.has(dayKey(i.created_at)));
  s.booked = madeInRange.filter((i) => !i.is_follow_up).length;
  s.secondBooked = madeInRange.filter((i) => i.is_follow_up).length;
  s.due = due.length;
  // A missed slot of a moved meeting is a resolved slot that did not sit.
  for (const slot of dueAll.filter((i) => i.is_reschedule_slot)) {
    s.resolved += 1;
    s.rescheduled += 1;
    if (slot.is_follow_up) { s.followResolved += 1; continue; }
    s.firstResolved += 1;
    s.firstRescheduled += 1;
    if (isProspectReschedule(slot.outcome_reason)) s.movedByProspect += 1;
    else if (isOurReschedule(slot.outcome_reason)) s.movedByUs += 1;
    if ((slot.outcome_reason ?? "").startsWith("rs_phone_")) s.movedPhoneCall += 1;
  }

  const slotKeys = new Map<string, number>();
  for (const i of due) {
    const bucket = i.resolved_bucket ?? "";
    const first = !i.is_follow_up;
    const outcome = i.appointment_outcome ?? "";
    if (RESOLVED.has(bucket)) {
      s.resolved += 1;
      if (first) s.firstResolved += 1; else s.followResolved += 1;
    }
    if (bucket === "showed") { s.showed += 1; if (first) s.showedFirst += 1; else s.showedFollow += 1; }
    if (bucket === "noshow") { s.noShow += 1; if (first) s.firstNoShow += 1; }
    if (bucket === "cancelled") {
      s.cancelled += 1;
      if (first) {
        s.firstCancelled += 1;
        const r = i.outcome_reason && /^cx_/.test(i.outcome_reason) ? i.outcome_reason : "unrecorded";
        s.cxReasons[r] = (s.cxReasons[r] ?? 0) + 1;
      }
    }
    if (first && RESOLVED.has(bucket)) {
      // Real moves only: reschedule_count also goes up when a date typo is corrected.
      const moved = movesOf(i) > 0;
      if (moved) { s.movedResolved += 1; if (bucket === "showed") s.movedShowed += 1; }
      else { s.neverMovedResolved += 1; if (bucket === "showed") s.neverMovedShowed += 1; }
    }
    if (bucket === "rescheduled") { s.rescheduled += 1; if (first) s.firstRescheduled += 1; }
    // A cancelled meeting no longer holds the slot, so it cannot double-book it.
    if (i.scheduled_for && bucket !== "cancelled") {
      const k = `${i.assigned_user_id}-${i.scheduled_for}`;
      slotKeys.set(k, (slotKeys.get(k) ?? 0) + 1);
    }
    // Recorded sittings only: a recording linked to a no-show is not meeting time.
    if (bucket === "showed") s.meetingMinutes += minutesByItem.get(i.id) ?? 0;
    if (SHOWED.has(outcome) && i.is_qualified === true) s.qualifiedLive += 1;
    if (SHOWED.has(outcome) && i.is_qualified === false) s.notQualifiedLive += 1;
    const pitchedHere = bucket === "showed" && wasPitched(i);
    if (pitchedHere) {
      s.pitched += 1;
      if (first) s.pitchedFirst += 1; else s.pitchedFollow += 1;
      // Same "qualified" as the Qualified live calls row: marked qualified, not merely not-unqualified.
      if (i.is_qualified === true) {
        s.pitchedQualified += 1;
        if (outcome === "showed_closed") s.closedQualified += 1;
      }
    } else if (bucket === "showed" && outcome !== "disqualified") {
      s.satNotPitched += 1;
    }
    if (i.proposal_status === "sent") s.proposalsSent += 1;
    if (i.proposal_status === "to_send") s.proposalsOwed += 1;
    // Objection rates are ÷ pitched, so only pitched no-closes carry an objection.
    // Every pitched meeting that did not close lands in exactly one row, so the
    // breakdown adds up to "Total not closed".
    if (pitchedHere && outcome !== "showed_closed") {
      if (NO_CLOSE.has(outcome)) {
        const r = i.outcome_reason || "unrecorded";
        const k = hasLabel(OBJ_LABEL, r) ? r : UNMAPPED;
        s.obj[k] = (s.obj[k] ?? 0) + 1;
      } else if (VERBAL_OR_SECOND.has(outcome)) {
        s.notClosedVerbal += 1;
      } else {
        s.obj[UNMAPPED] = (s.obj[UNMAPPED] ?? 0) + 1;
      }
    }
    if (outcome === "disqualified") {
      s.dq += 1;
      const r = i.dq_reason || "unrecorded";
      const k = hasLabel(DQ_LABEL, r) ? r : UNMAPPED;
      s.dqReasons[k] = (s.dqReasons[k] ?? 0) + 1;
    }
    if (outcome === "showed_closed") {
      s.closed += 1;
      if (first) s.closedFirst += 1; else s.closedFollow += 1;
      const mrr = i.monthly_recurring_value ?? 0;
      const one = i.deal_value ?? 0;
      if (mrr > 0) s.retainerDeals += 1;
      if (one > 0) s.oneOffDeals += 1;
      s.mrr += mrr;
      s.oneOff += one;
      s.cash += mrr + one;
    }
    if (outcome === "showed_verbal_commitment") s.verbal += 1;
  }
  for (const n of slotKeys.values()) if (n > 1) s.doubleBooked += n - 1;
  s.notClosed = s.pitched - s.closed;
  return s;
}

type Fmt = "n" | "pct" | "money" | "hm";
interface RowDef {
  label: string;
  fmt: Fmt;
  hint?: string;
  value: (s: Stats) => number | null;
  emphasis?: boolean;
}
interface SectionDef {
  title: string;
  rows: RowDef[];
}

const pct = (n: number, d: number) => (d > 0 ? (100 * n) / d : null);

const CX_LABEL: Record<string, string> = {
  cx_not_interested: "No longer interested",
  cx_timing: "Timing",
  cx_competitor: "Went with someone else",
  cx_price: "Price",
  cx_other: "Other / no reason given",
  unrecorded: "Unrecorded",
};

const OBJ_LABEL: Record<string, string> = {
  price_budget: "Price / budget",
  think_partner: "Needs to think / partner",
  timing: "Timing",
  agency_trust: "Has an agency / trust",
  other: "Other reason",
  unrecorded: "No reason recorded",
};
const DQ_LABEL: Record<string, string> = {
  dq_too_small: "Too small / low revenue",
  dq_wrong_fit: "Wrong fit / industry",
  dq_not_dm: "Not decision maker",
  dq_no_capacity: "No capacity for more work",
  unrecorded: "No reason recorded",
};

function buildSections(repFiltered = false): SectionDef[] {
  const slotsHint = "9:00 to 18:30 Mon to Fri (less the Mon and Thu directors' hour), 9:00 to 13:00 Sat";
  return [
    {
      title: "Bookings",
      rows: [
        repFiltered
          ? { label: "Available slots (team-wide)", fmt: "n", hint: `${slotsHint}. The calendar is shared, so this is not filtered by rep.`, value: (s) => s.availableSlots }
          : { label: "Available slots", fmt: "n", hint: slotsHint, value: (s) => s.availableSlots },
        { label: "Bookings made", fmt: "n", hint: repFiltered ? "first meetings booked by this rep as setter, by the day they were booked" : "first meetings, by the day they were booked", value: (s) => s.booked },
        { label: "Second meetings booked", fmt: "n", hint: "follow-up meetings, by the day they were booked", value: (s) => s.secondBooked },
        { label: "Bookings due", fmt: "n", hint: "meetings scheduled for the day", value: (s) => s.due, emphasis: true },
        { label: "Resolved slots", fmt: "n", hint: "showed + no-show + cancelled + rescheduled", value: (s) => s.resolved },
        { label: "Showed (sittings)", fmt: "n", value: (s) => s.showed, emphasis: true },
        { label: "  First meetings", fmt: "n", value: (s) => s.showedFirst },
        { label: "  Second meetings", fmt: "n", value: (s) => s.showedFollow },
        { label: "No-show", fmt: "n", value: (s) => s.noShow },
        { label: "Cancelled", fmt: "n", value: (s) => s.cancelled },
        { label: "Rescheduled", fmt: "n", value: (s) => s.rescheduled },
        { label: "Double booked", fmt: "n", hint: "slots sharing a closer and a start time, cancelled meetings left out", value: (s) => s.doubleBooked },
        { label: "Meeting time (Fathom)", fmt: "hm", hint: "recorded sittings only", value: (s) => s.meetingMinutes },
        { label: "Booking rate", fmt: "pct", hint: repFiltered ? "bookings due ÷ team-wide available slots" : "bookings due ÷ available slots", value: (s) => pct(s.due, s.availableSlots), emphasis: true },
      ],
    },
    {
      title: "Show rates",
      rows: [
        { label: "Show rate (first meetings)", fmt: "pct", hint: "showed ÷ resolved first-meeting slots", value: (s) => pct(s.showedFirst, s.firstResolved), emphasis: true },
        { label: "Show rate (all sittings)", fmt: "pct", value: (s) => pct(s.showed, s.resolved) },
        { label: "Second-meeting show rate", fmt: "pct", value: (s) => pct(s.showedFollow, s.followResolved) },
        { label: "No-show %", fmt: "pct", hint: "first meetings", value: (s) => pct(s.firstNoShow, s.firstResolved) },
        { label: "Cancel %", fmt: "pct", hint: "first meetings", value: (s) => pct(s.firstCancelled, s.firstResolved) },
        { label: "Reschedule %", fmt: "pct", hint: "first meetings: missed slots of moved meetings", value: (s) => pct(s.firstRescheduled, s.firstResolved) },
      ],
    },
    {
      title: "Reschedules and cancellations",
      rows: [
        { label: "Reschedules", fmt: "n", hint: "missed first-meeting slots, on the day each was missed", value: (s) => s.firstRescheduled, emphasis: true },
        { label: "  Prospect asked", fmt: "n", value: (s) => s.movedByProspect },
        { label: "    of which phone call only", fmt: "n", hint: "answered but not at a laptop / not somewhere quiet, rebooked", value: (s) => s.movedPhoneCall },
        { label: "  We moved it / double-booked", fmt: "n", value: (s) => s.movedByUs },
        { label: "  No reason recorded", fmt: "n", value: (s) => s.firstRescheduled - s.movedByProspect - s.movedByUs },
        { label: "Moved by us %", fmt: "pct", hint: "÷ reschedules", value: (s) => pct(s.movedByUs, s.firstRescheduled) },
        { label: "Show rate after a reschedule", fmt: "pct", hint: "moved first meetings that sat ÷ moved first meetings resolved, on the day they finally happened", value: (s) => pct(s.movedShowed, s.movedResolved), emphasis: true },
        { label: "Show rate, never moved", fmt: "pct", hint: "first meetings never rescheduled", value: (s) => pct(s.neverMovedShowed, s.neverMovedResolved) },
        { label: "Cancellations", fmt: "n", hint: "first meetings", value: (s) => s.firstCancelled, emphasis: true },
        ...Object.entries(CX_LABEL).map<RowDef>(([k, label]) => ({ label: `  ${label}`, fmt: "n", value: (s) => s.cxReasons[k] ?? 0 })),
      ],
    },
    {
      title: "Live calls and offers",
      rows: [
        { label: "Qualified live calls", fmt: "n", hint: "sat and marked qualified", value: (s) => s.qualifiedLive },
        {
          label: "Qualified live call rate",
          fmt: "pct",
          // Same rule as the Setters tab: a sitting nobody has judged yet is left out, not counted against it.
          hint: "qualified ÷ live calls marked qualified or not; unmarked ones are left out",
          value: (s) => pct(s.qualifiedLive, s.qualifiedLive + s.notQualifiedLive),
        },
        { label: "Offers made (pitched)", fmt: "n", hint: "closer marked Pitched, or a close decision recorded on older meetings", value: (s) => s.pitched, emphasis: true },
        { label: "Offer rate", fmt: "pct", hint: "pitched ÷ showed", value: (s) => pct(s.pitched, s.showed) },
        { label: "Proposals sent", fmt: "n", hint: "sittings marked Proposal sent, by meeting day", value: (s) => s.proposalsSent },
        { label: "Proposals still owed", fmt: "n", hint: "marked Proposal to send, not yet sent", value: (s) => s.proposalsOwed },
        { label: "Proposal rate", fmt: "pct", hint: "proposals sent or owed ÷ pitched", value: (s) => pct(s.proposalsSent + s.proposalsOwed, s.pitched) },
        { label: "Sat, not pitched", fmt: "n", hint: "Not pitched, or second meeting booked on older rows", value: (s) => s.satNotPitched },
        { label: "Disqualified on the call", fmt: "n", value: (s) => s.dq },
        { label: "DQ rate", fmt: "pct", hint: "÷ showed", value: (s) => pct(s.dq, s.showed) },
        ...Object.entries(DQ_LABEL).map<RowDef>(([k, label]) => ({ label: `  DQ: ${label}`, fmt: "n", value: (s) => s.dqReasons[k] ?? 0 })),
        { label: "  DQ: Other / unmapped", fmt: "n", hint: "a reason with no label here (free text or an old code)", value: (s) => s.dqReasons[UNMAPPED] ?? 0 },
      ],
    },
    {
      title: "Not closed",
      rows: [
        { label: "Total not closed", fmt: "n", hint: "pitched − closed", value: (s) => s.notClosed, emphasis: true },
        { label: "  Verbal / second meeting booked", fmt: "n", hint: "pitched, next step still open, no objection recorded", value: (s) => s.notClosedVerbal },
        { label: "  Verbal / second meeting booked rate", fmt: "pct", hint: "÷ pitched", value: (s) => pct(s.notClosedVerbal, s.pitched) },
        ...[...Object.entries(OBJ_LABEL), [UNMAPPED, "Other / unmapped"] as [string, string]].flatMap<RowDef>(([k, label]) => [
          { label: `  ${label}`, fmt: "n", hint: k === UNMAPPED ? "a reason with no label here, or a pitched meeting with no close decision" : undefined, value: (s) => s.obj[k] ?? 0 },
          { label: `  ${label} rate`, fmt: "pct", hint: "÷ pitched", value: (s) => pct(s.obj[k] ?? 0, s.pitched) },
        ]),
      ],
    },
    {
      title: "Closes",
      rows: [
        { label: "Same-day closes", fmt: "n", hint: "closed on the first sitting", value: (s) => s.closedFirst },
        { label: "Follow-up closes", fmt: "n", hint: "closed on a second meeting", value: (s) => s.closedFollow },
        { label: "Total closes", fmt: "n", hint: "meetings marked Close, by meeting day", value: (s) => s.closed, emphasis: true },
        { label: "New clients (revenue records)", fmt: "n", hint: "team, every source: first deal starts that day. Same number as Won on Overview and Closed on the Funnel", value: (s) => s.newClients, emphasis: true },
        { label: "New client MRR", fmt: "money", hint: "first-deal monthly value, every source", value: (s) => s.newClientsMrr },
        { label: "Verbal commitments", fmt: "n", value: (s) => s.verbal },
        { label: "Retainer deals", fmt: "n", hint: "closes with a monthly value", value: (s) => s.retainerDeals },
        { label: "One-off deals", fmt: "n", hint: "closes with a one-off fee", value: (s) => s.oneOffDeals },
        { label: "Same-day close rate", fmt: "pct", hint: "÷ first-sitting pitches", value: (s) => pct(s.closedFirst, s.pitchedFirst) },
        { label: "Follow-up close rate", fmt: "pct", hint: "÷ second-meeting pitches", value: (s) => pct(s.closedFollow, s.pitchedFollow) },
        { label: "Total bookings close rate", fmt: "pct", hint: "÷ bookings made", value: (s) => pct(s.closed, s.booked) },
        { label: "Bookings-due close rate", fmt: "pct", hint: "÷ bookings due", value: (s) => pct(s.closed, s.due) },
        { label: "Live call close rate", fmt: "pct", hint: "÷ showed", value: (s) => pct(s.closed, s.showed), emphasis: true },
        { label: "Qualified live call close rate", fmt: "pct", hint: "qualified closes ÷ pitched and marked qualified", value: (s) => pct(s.closedQualified, s.pitchedQualified), emphasis: true },
        { label: "Offer-to-close rate", fmt: "pct", hint: "÷ pitched", value: (s) => pct(s.closed, s.pitched) },
        { label: "Verbal commitment rate", fmt: "pct", hint: "÷ pitched", value: (s) => pct(s.verbal, s.pitched) },
      ],
    },
    {
      title: "Cash",
      rows: [
        { label: "First collection", fmt: "money", hint: "one-off + first retainer month", value: (s) => s.cash, emphasis: true },
        { label: "Retainers won (MRR)", fmt: "money", value: (s) => s.mrr },
        { label: "One-off collected", fmt: "money", value: (s) => s.oneOff },
        { label: "Avg first collection per sale", fmt: "money", value: (s) => (s.closed > 0 ? s.cash / s.closed : null) },
        { label: "Cash per live call", fmt: "money", value: (s) => (s.showed > 0 ? s.cash / s.showed : null) },
        { label: "Cash per booking due", fmt: "money", value: (s) => (s.due > 0 ? s.cash / s.due : null) },
        { label: "Cash per booking made", fmt: "money", value: (s) => (s.booked > 0 ? s.cash / s.booked : null) },
      ],
    },
  ];
}

/** A row's numbers: for the tier in view, and for Tier 1 and Tier 2 on their own. */
interface Bundle {
  s: Stats;
  t1: Stats;
  t2: Stats;
}
interface BundleRowDef extends Omit<RowDef, "value"> {
  value: (b: Bundle) => number | null;
}
const EMPTY_BUNDLE: Bundle = { s: emptyStats(), t1: emptyStats(), t2: emptyStats() };
const NO_CLIENTS: never[] = [];

/**
 * Tier split (All only): Tier 1 vs Tier 2 on the same definitions as the rest of
 * the table. Tier 1 = 3+ on the tools incl. the owner and $50k+ a month, from the
 * booking, else the contact. Bookings and clients with an unknown tier are in neither.
 */
const TIER_SPLIT: BundleRowDef[] = [
  { label: "T1 bookings made", fmt: "n", hint: "first meetings booked, Tier 1", value: (b) => b.t1.booked, emphasis: true },
  { label: "T2 bookings made", fmt: "n", hint: "first meetings booked, Tier 2", value: (b) => b.t2.booked, emphasis: true },
  { label: "% Tier 1", fmt: "pct", hint: "Tier 1 ÷ all bookings made", value: (b) => pct(b.t1.booked, b.s.booked) },
  { label: "T1 show rate", fmt: "pct", hint: "first meetings: showed ÷ resolved", value: (b) => pct(b.t1.showedFirst, b.t1.firstResolved) },
  { label: "T2 show rate", fmt: "pct", hint: "first meetings: showed ÷ resolved", value: (b) => pct(b.t2.showedFirst, b.t2.firstResolved) },
  { label: "T1 closes", fmt: "n", value: (b) => b.t1.closed },
  { label: "T2 closes", fmt: "n", value: (b) => b.t2.closed },
  { label: "T1 live call close rate", fmt: "pct", hint: "closes ÷ showed", value: (b) => pct(b.t1.closed, b.t1.showed) },
  { label: "T2 live call close rate", fmt: "pct", hint: "closes ÷ showed", value: (b) => pct(b.t2.closed, b.t2.showed) },
  { label: "T1 first collection", fmt: "money", value: (b) => b.t1.cash },
  { label: "T2 first collection", fmt: "money", value: (b) => b.t2.cash },
  { label: "T1 avg per sale", fmt: "money", value: (b) => (b.t1.closed > 0 ? b.t1.cash / b.t1.closed : null) },
  { label: "T2 avg per sale", fmt: "money", value: (b) => (b.t2.closed > 0 ? b.t2.cash / b.t2.closed : null) },
  { label: "T1 cash per booking", fmt: "money", hint: "first collection ÷ bookings made", value: (b) => (b.t1.booked > 0 ? b.t1.cash / b.t1.booked : null) },
  { label: "T2 cash per booking", fmt: "money", hint: "first collection ÷ bookings made", value: (b) => (b.t2.booked > 0 ? b.t2.cash / b.t2.booked : null) },
];

function format(v: number | null, fmt: Fmt) {
  if (v === null) return "—";
  switch (fmt) {
    case "pct":
      return `${Math.round(v)}%`;
    case "money":
      return `$${Math.round(v).toLocaleString("en-AU")}`;
    case "hm": {
      const h = Math.floor(v / 60);
      const m = Math.round(v % 60);
      return v === 0 ? "0:00" : `${h}:${String(m).padStart(2, "0")}`;
    }
    default:
      return String(v);
  }
}

function useMeetingMinutes(itemIds: string[]) {
  const key = itemIds.slice().sort().join(",");
  return useQuery({
    queryKey: ["fathom-minutes", key],
    enabled: itemIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const map = new Map<string, number>();
      for (let i = 0; i < itemIds.length; i += 200) {
        const { data, error } = await supabase
          .from("fathom_meetings")
          .select("pipeline_item_id, start_at, end_at")
          .in("pipeline_item_id", itemIds.slice(i, i + 200));
        if (error) throw error;
        for (const f of data ?? []) {
          if (!f.pipeline_item_id || !f.start_at || !f.end_at) continue;
          const mins = Math.max(0, (new Date(f.end_at).getTime() - new Date(f.start_at).getTime()) / 60_000);
          map.set(f.pipeline_item_id, (map.get(f.pipeline_item_id) ?? 0) + mins);
        }
      }
      return map;
    },
  });
}

export function ClosingTracker({ dateFrom, dateTo, bookings, rescheduleSlots = [], activeRepId, selectedRepLabel }: Props) {
  const [tier, setTier] = useState<TierFilter>("all");
  const { data: rawNewClients = NO_CLIENTS } = useNewClients(dateFrom, dateTo);
  // A new client takes the tier of the contact's latest booking, as on the Tracker.
  const { data: history } = useContactBookingHistory(rawNewClients.map((n) => n.contact_id));
  const newClients = useMemo(
    () => creditNewClients(rawNewClients, history?.history ?? [], history?.contacts),
    [rawNewClients, history],
  );
  const all = useMemo(() => [...bookings, ...rescheduleSlots], [bookings, rescheduleSlots]);
  // With a rep picked, meetings count for the closer (assigned_user_id) and
  // bookings made count for the setter (created_by), as on every other tab.
  const items = useMemo(
    () => (activeRepId ? all.filter((b) => b.assigned_user_id === activeRepId) : all),
    [all, activeRepId],
  );
  const setterItems = useMemo(
    () => (activeRepId ? all.filter((b) => b.created_by === activeRepId) : all),
    [all, activeRepId],
  );
  const itemIds = useMemo(() => items.filter((i) => !i.is_reschedule_slot).map((i) => i.id), [items]);
  const tierOf = useCallback((i: Item) => bookingTierOf(i as Item & { booking_tier?: string | null }), []);
  const { data: minutesByItem = new Map<string, number>() } = useMeetingMinutes(itemIds);
  const sections = useMemo(() => buildSections(!!activeRepId), [activeRepId]);
  const metrics = useMemo<{ section: string; row: BundleRowDef }[]>(
    () => [
      ...sections.flatMap((section) => section.rows.map((row) => ({ section: section.title, row: { ...row, value: (b: Bundle) => row.value(b.s) } }))),
      ...(tier === "all" ? TIER_SPLIT.map((row) => ({ section: "Tier split", row })) : []),
    ],
    [sections, tier],
  );
  const sectionStart = useMemo(
    () => new Set(metrics.filter((m, i) => i === 0 || metrics[i - 1].section !== m.section).map((m) => `${m.section}|${m.row.label}`)),
    [metrics],
  );

  // Days in the range, grouped into months and Sunday-to-Saturday weeks (a week never crosses a month).
  const months = useMemo(() => {
    const days = dateFrom && dateTo && dateFrom <= dateTo ? daysBetween(dateFrom, dateTo) : [];
    const byMonth = new Map<string, string[]>();
    for (const d of days) byMonth.set(monthOf(d), [...(byMonth.get(monthOf(d)) ?? []), d]);
    return [...byMonth.entries()].map(([month, mDays]) => ({ month, days: mDays, weeks: weeksOf(mDays) }));
  }, [dateFrom, dateTo]);

  // One Stats per range, month, week and day: for the tier in view, and for
  // Tier 1 and Tier 2 on their own (the Tier split columns). Unknown tier is in neither.
  const byTier = useMemo(() => {
    const pick = (f: TierFilter) => ({
      items: f === "all" ? items : items.filter((i) => tierOf(i) === f),
      setterItems: f === "all" ? setterItems : setterItems.filter((i) => tierOf(i) === f),
      newClients: newClients.filter((n) => matchesTier(n.tier, f)),
    });
    return { view: pick(tier), t1: pick("tier_1"), t2: pick("tier_2") };
  }, [items, setterItems, newClients, tier, tierOf]);

  const stats = useMemo(() => {
    const out = new Map<string, Bundle>();
    const one = (src: (typeof byTier)["view"], set: Set<string>) => {
      const s = computeStats(src.items, set, minutesByItem, src.setterItems);
      for (const n of src.newClients) {
        if (set.has(n.first_start)) { s.newClients += 1; s.newClientsMrr += n.mrr; }
      }
      return s;
    };
    const add = (key: string, days: string[]) => {
      const set = new Set(days);
      out.set(key, {
        s: one(byTier.view, set),
        t1: tier === "all" ? one(byTier.t1, set) : emptyStats(),
        t2: tier === "all" ? one(byTier.t2, set) : emptyStats(),
      });
    };
    add("range", months.flatMap((m) => m.days));
    for (const m of months) {
      add(`m:${m.month}`, m.days);
      for (const w of m.weeks) add(`w:${w[0]}`, w);
      for (const d of m.days) add(`d:${d}`, [d]);
    }
    return out;
  }, [months, byTier, minutesByItem, tier]);

  const today = dayKey(new Date().toISOString());
  const currentMonth = monthOf(today);

  // Open / closed months and weeks, remembered in this browser. Untouched ones
  // follow the Tracker's default: the current month and the current week open.
  const [openState, setOpenState] = useState<Record<string, boolean>>(readOpenState);
  const setOpen = useCallback((updates: Record<string, boolean>) => {
    setOpenState((prev) => {
      const next = { ...prev, ...updates };
      writeOpenState(next);
      return next;
    });
  }, []);
  const monthOpen = (month: string) => openState[month] ?? defaultMonthOpen(month, currentMonth, months.length);
  const weekOpen = (w: string[], count: number) => openState[weekKey(w[0])] ?? defaultWeekOpen(w[0], w[w.length - 1], today, count);
  const allOpen = months.length > 0 && months.every((m) => monthOpen(m.month) && m.weeks.every((w) => weekOpen(w, m.weeks.length)));
  const setAllOpen = (open: boolean) =>
    setOpen(Object.fromEntries(months.flatMap((m) => [[m.month, open], ...m.weeks.map((w) => [weekKey(w[0]), open])])));

  const cells = (b: Bundle | undefined, level: "range" | "month" | "week" | "day") =>
    metrics.map(({ section, row }) => {
      const v = row.value(b ?? EMPTY_BUNDLE);
      const empty = v === null || v === 0;
      const total = level !== "day";
      return (
        <td
          key={`${section}|${row.label}`}
          className={cn(
            "border-b border-border px-1.5 py-1 text-center font-mono tabular-nums whitespace-nowrap",
            sectionStart.has(`${section}|${row.label}`) && "border-l",
            total && "font-semibold",
            empty ? "text-muted-foreground/50" : "text-foreground",
            row.fmt === "pct" && v !== null && v >= 50 && "text-emerald-700 dark:text-emerald-300",
            row.fmt === "pct" && v !== null && v > 0 && v < 25 && "text-red-600 dark:text-red-400",
          )}
        >
          {format(v, row.fmt)}
        </td>
      );
    });

  const sectionSpans = useMemo(() => {
    const out: { title: string; span: number }[] = [];
    for (const m of metrics) {
      const last = out[out.length - 1];
      if (last && last.title === m.section) last.span += 1;
      else out.push({ title: m.section, span: 1 });
    }
    return out;
  }, [metrics]);

  const stickyDay = "sticky left-0 z-10 border-b border-r border-border px-2 py-1 whitespace-nowrap";

  return (
    <ReportSection
      title="Closing tracker"
      description={`One row per day, week and month totals that collapse, and the range total${selectedRepLabel ? `, ${selectedRepLabel}: bookings made as setter, everything else as closer; available slots stay team-wide` : ""}. Bookings made count by the day booked; everything else counts by the day of the meeting. Show rates use resolved slots; close rates use pitched meetings; cash is the first collection.`}
      className="overflow-hidden"
    >
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-border bg-background p-0.5" role="group" aria-label="Tier filter">
          {(["all", "tier_1", "tier_2"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTier(t)}
              aria-pressed={tier === t}
              className={cn(
                "rounded-sm px-2.5 py-1 text-xs transition-colors",
                tier === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "all" ? "All" : t === "tier_1" ? "Tier 1" : "Tier 2"}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground">
          {tier === "all"
            ? "Tier split columns compare Tier 1 and Tier 2 side by side."
            : `${tier === "tier_1" ? "Tier 1" : "Tier 2"} bookings only (available slots stay team-wide).`}
        </span>
        <Button className="ml-auto" type="button" variant="outline" size="sm" onClick={() => setAllOpen(!allOpen)} disabled={months.length === 0}>
          {allOpen ? "Collapse all" : "Expand all"}
        </Button>
      </div>
      <div className="max-h-[75vh] overflow-auto rounded-md border border-border">
        <table className="min-w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th rowSpan={2} className="sticky left-0 top-0 z-30 min-w-[150px] border-b border-r border-border bg-card px-2 py-1.5 text-left font-medium text-muted-foreground">
                Day
              </th>
              {sectionSpans.map((sec, i) => (
                <th
                  key={sec.title}
                  colSpan={sec.span}
                  className={cn(
                    "sticky top-0 z-20 border-b border-border bg-muted px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground",
                    i > 0 && "border-l",
                  )}
                >
                  {sec.title}
                </th>
              ))}
            </tr>
            <tr>
              {metrics.map(({ section, row }) => (
                <th
                  key={`${section}|${row.label}`}
                  title={row.hint}
                  className={cn(
                    "sticky top-[25px] z-20 min-w-[72px] max-w-[110px] border-b border-border bg-card px-1.5 py-1.5 text-center align-bottom font-medium leading-tight text-muted-foreground",
                    sectionStart.has(`${section}|${row.label}`) && "border-l",
                    row.emphasis && "text-foreground",
                  )}
                >
                  {row.label.trim()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {months.length > 1 ? (
              <tr className="bg-primary/20">
                <td className={cn(stickyDay, "bg-solid-primary-25 font-semibold")}>Range total</td>
                {cells(stats.get("range"), "range")}
              </tr>
            ) : null}
            {months.map((m) => {
              const mOpen = monthOpen(m.month);
              return (
                <Fragment key={m.month}>
                  <tr className="cursor-pointer bg-primary/10" onClick={() => setOpen({ [m.month]: !mOpen })}>
                    <td className={cn(stickyDay, "bg-solid-primary-20 px-1 font-semibold")}>
                      {/* No handler of its own: the click bubbles to the row, so it toggles once. */}
                      <button type="button" aria-expanded={mOpen} className="flex items-center gap-1 rounded-sm px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform", mOpen && "rotate-90")} aria-hidden="true" />
                        <span>{fmtMonth(m.month)} total</span>
                      </button>
                    </td>
                    {cells(stats.get(`m:${m.month}`), "month")}
                  </tr>
                  {mOpen
                    ? m.weeks.map((w) => {
                        const wOpen = weekOpen(w, m.weeks.length);
                        return (
                          <Fragment key={w[0]}>
                            <tr className="cursor-pointer bg-muted/60" onClick={() => setOpen({ [weekKey(w[0])]: !wOpen })}>
                              <td className={cn(stickyDay, "bg-muted px-1 font-semibold")}>
                                <button type="button" aria-expanded={wOpen} className="flex items-center gap-1 rounded-sm pl-3 pr-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                  <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform", wOpen && "rotate-90")} aria-hidden="true" />
                                  <span>{fmtWeek(w[0], w[w.length - 1])}</span>
                                </button>
                              </td>
                              {cells(stats.get(`w:${w[0]}`), "week")}
                            </tr>
                            {wOpen
                              ? w.map((d) => (
                                  <tr key={d} className="hover:bg-muted/30">
                                    <td
                                      className={cn(
                                        stickyDay,
                                        "bg-card",
                                        d > today ? "text-muted-foreground/60" : d === today ? "text-primary" : "text-muted-foreground",
                                      )}
                                    >
                                      {fmtDay(d)}
                                    </td>
                                    {cells(stats.get(`d:${d}`), "day")}
                                  </tr>
                                ))
                              : null}
                          </Fragment>
                        );
                      })
                    : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Not in the dialer yet, so not shown: meeting time outside Fathom, deposits versus paid in full, and
        "missed because the previous call ran over". Objection and DQ reasons come from the reason picked when the
        outcome was logged; "No reason recorded" means it was not picked.
      </p>
    </ReportSection>
  );
}
