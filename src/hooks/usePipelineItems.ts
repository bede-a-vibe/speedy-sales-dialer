import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppointmentOutcomeValue } from "@/lib/appointments";
import type { DealStage } from "@/data/constants";
import { inferBookers, markFollowUpMeetings, mergeGhlOnlyMeetings, type BookingHistoryRow, type UnifiedMeetingLite } from "@/lib/mergeMeetingStreams";

export type PipelineType = "follow_up" | "booked";
export type PipelineStatus = "open" | "completed" | "canceled";
export type FollowUpMethod = "call" | "email" | "prospecting" | "task" | "sms";

export interface PipelineItemInsert {
  contact_id: string;
  source_call_log_id?: string | null;
  pipeline_type: PipelineType;
  assigned_user_id: string;
  created_by: string;
  scheduled_for?: string | null;
  notes?: string;
  status?: PipelineStatus;
  follow_up_method?: FollowUpMethod;
  ghl_opportunity_id?: string | null;
  ghl_pipeline_id?: string | null;
  ghl_stage_id?: string | null;
  /** Booking tier (tier_1 | tier_2, null = unknown) and where it came from (auto | setter). */
  booking_tier?: string | null;
  booking_tier_source?: string | null;
  /** manual_set | self_booked | booking_request */
  booking_method?: string | null;
}

export interface PipelineItemUpdate {
  reschedule_count?: number;
  id: string;
  assigned_user_id?: string;
  scheduled_for?: string | null;
  status?: PipelineStatus;
  notes?: string;
  completed_at?: string | null;
  appointment_outcome?: AppointmentOutcomeValue | null;
  outcome_recorded_at?: string | null;
  outcome_notes?: string;
  deal_value?: number | null;
  monthly_recurring_value?: number | null;
  follow_up_method?: FollowUpMethod;
  ghl_opportunity_id?: string | null;
  ghl_pipeline_id?: string | null;
  ghl_stage_id?: string | null;
  deal_stage?: DealStage | null;
  outcome_reason?: string | null;
  recording_url?: string | null;
  phone_recording_url?: string | null;
}

export interface PipelineItemWithRelations {
  id: string;
  contact_id: string;
  source_call_log_id: string | null;
  pipeline_type: PipelineType;
  assigned_user_id: string;
  created_by: string;
  scheduled_for: string | null;
  notes: string;
  status: PipelineStatus;
  completed_at: string | null;
  appointment_outcome: AppointmentOutcomeValue | null;
  outcome_recorded_at: string | null;
  outcome_notes: string;
  deal_value: number | null;
  monthly_recurring_value: number | null;
  deal_stage: DealStage | null;
  follow_up_method: FollowUpMethod;
  ghl_opportunity_id: string | null;
  ghl_pipeline_id: string | null;
  ghl_stage_id: string | null;
  reschedule_count: number;
  outcome_reason?: string | null;
  recording_url?: string | null;
  phone_recording_url?: string | null;
  ghl_sync_error?: string | null;
  ghl_stage_synced_at?: string | null;
  booking_tier?: string | null;
  booking_method?: string | null;
  /** Qualified verdict on the meeting (null = not marked). */
  is_qualified?: boolean | null;
  /** Why a sitting was disqualified, when logged outside outcome_reason. */
  dq_reason?: string | null;
  created_at: string;
  updated_at: string;
  contacts: {
    id: string;
    business_name: string;
    contact_person: string | null;
    dm_name: string | null;
    industry: string;
    phone: string;
    state: string | null;
    website: string | null;
    gmb_link: string | null;
    ghl_contact_id: string | null;
    lead_type: string | null;
  } | null;
}

export interface SalesRepOption {
  user_id: string;
  display_name: string | null;
  email: string | null;
}

export interface BookedAppointmentReportItem {
  id: string;
  contact_id: string;
  created_at: string;
  created_by: string;
  assigned_user_id: string;
  scheduled_for: string | null;
  appointment_outcome: AppointmentOutcomeValue | null;
  outcome_recorded_at: string | null;
  status: PipelineStatus;
  deal_value: number | null;
  monthly_recurring_value: number | null;
  reschedule_count: number;
  /** Why a showed meeting did not close, or why it was missed (see appointments.ts reason lists). */
  outcome_reason?: string | null;
  /** Why a sitting was disqualified. */
  dq_reason?: string | null;
  /** Setter's qualification verdict on the booking (null = not judged yet). */
  is_qualified?: boolean | null;
  /** Closer's record of whether the offer was pitched (null = not recorded). */
  pitched?: boolean | null;
  /** Real moves (meeting_reschedules kind 'move'); reschedule_count also counts entry errors. Use movesOf(). */
  move_count?: number | null;
  /** Lead source channel (Cold Call, Ads, Referral...): public.meeting_channel, same rule as v_meetings_unified. */
  meeting_channel?: string | null;
  /** Proposal after the sitting: to_send (owed) or sent. */
  proposal_status?: "to_send" | "sent" | null;
  proposal_sent_date?: string | null;
  /** Which booking stream the row came from. GHL-only cold meetings are merged in. */
  stream?: "dialer" | "ghl";
  /** True when this contact already showed at an earlier booking (second meeting, not a reschedule). */
  is_follow_up?: boolean;
  /**
   * How the slot resolved — showed / noshow / cancelled / rescheduled /
   * upcoming / pending — decided by public.resolve_meeting_bucket in the
   * database and read here rather than re-derived. That duplication is what
   * let the Sources page and the Custom Monitor report different show rates
   * for the same meetings.
   */
  resolved_bucket?: string | null;
  /** A missed slot of a moved meeting (meeting_reschedules). Show-up buckets only; never a booking. */
  is_reschedule_slot?: boolean;
  /** tier_1 | tier_2, null = not recorded (see bookingTierOf for the contact fallback). */
  booking_tier?: string | null;
  /** manual_set | self_booked | booking_request, null = not recorded. */
  booking_method?: string | null;
  contacts?: {
    industry: string | null;
    state: string | null;
    trade_type: string | null;
    work_type: string | null;
    business_size: string | null;
    prospect_tier: string | null;
    buying_signal_strength: string | null;
    phone_type: string | null;
    has_google_ads: string | null;
    has_facebook_ads: string | null;
    dm_phone: string | null;
    gbp_rating: number | null;
    review_count: number | null;
    team_size?: number | null;
    monthly_revenue?: number | null;
  } | null;
}

export function usePipelineItems(type: PipelineType, status: PipelineStatus = "open") {
  return useQuery({
    queryKey: ["pipeline-items", type, status],
    queryFn: async () => {
      const isCompleted = status === "completed";
      const query = supabase
        .from("pipeline_items")
        .select(`
          id,
          contact_id,
          source_call_log_id,
          pipeline_type,
          assigned_user_id,
          created_by,
          scheduled_for,
          notes,
          status,
          completed_at,
          appointment_outcome,
          outcome_recorded_at,
          outcome_notes,
          deal_value,
          monthly_recurring_value,
          deal_stage,
          follow_up_method,
          reschedule_count,
          meeting_format,
          pitched,
          proposal_status,
          proposal_sent_date,
          outcome_reason,
          recording_url,
          phone_recording_url,
          meeting_ghl_opportunity_id,
          meeting_ghl_stage_id,
          ghl_sync_error,
          ghl_stage_synced_at,
          booking_tier,
          booking_method,
          is_qualified,
          dq_reason,
          created_at,
          updated_at,
          contacts:contacts!pipeline_items_contact_id_fkey (
            id,
            business_name,
            contact_person,
            dm_name,
            industry,
            phone,
            state,
            website,
            gmb_link,
            ghl_contact_id,
            lead_type
          )
        `)
        .eq("pipeline_type", type)
        .eq("status", status)
        .order(isCompleted ? "completed_at" : "scheduled_for", {
          ascending: !isCompleted,
          nullsFirst: false,
        })
        .order("created_at", { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      // The meeting's GHL link lives in meeting_ghl_* columns; expose it under
      // the shared ghl_* names the board and mirror cards already read.
      return ((data ?? []) as any[]).map((row) => ({
        ...row,
        ghl_opportunity_id: row.meeting_ghl_opportunity_id ?? null,
        ghl_stage_id: row.meeting_ghl_stage_id ?? null,
        ghl_pipeline_id: row.meeting_ghl_opportunity_id ? "6CHrrf2yQfsHCOJ8RkwK" : null,
      })) as PipelineItemWithRelations[];
    },
  });
}

export function useSalesReps() {
  return useQuery({
    queryKey: ["sales-reps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, email")
        .order("display_name", { ascending: true });

      if (error) throw error;
      return (data ?? []) as SalesRepOption[];
    },
    // Reps rarely change; avoid re-fetching every tab focus / navigation.
    staleTime: 5 * 60_000,
  });
}

/**
 * Who usually runs the meetings: the most common closer on the last 30 days of
 * bookings where the closer was not the setter. The database sets the real
 * closer from the GHL calendar event (ghl_event_closer); this is only the
 * picker's starting value, so a setter is never the default closer.
 */
export function useDefaultCloser() {
  return useQuery({
    queryKey: ["default-closer"],
    queryFn: async (): Promise<string | null> => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("pipeline_items")
        .select("assigned_user_id, created_by")
        .eq("pipeline_type", "booked")
        .gte("created_at", since)
        .limit(1000);
      if (error) throw error;
      const counts = new Map<string, number>();
      for (const row of data ?? []) {
        if (!row.assigned_user_id || row.assigned_user_id === row.created_by) continue;
        counts.set(row.assigned_user_id, (counts.get(row.assigned_user_id) ?? 0) + 1);
      }
      let best: string | null = null;
      for (const [id, n] of counts) if (!best || n > (counts.get(best) ?? 0)) best = id;
      return best;
    },
    staleTime: 30 * 60_000,
  });
}

export function useContactPipelineItems(contactId?: string) {
  return useQuery({
    queryKey: ["pipeline-items", "contact", contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_items")
        .select(`
          id,
          contact_id,
          source_call_log_id,
          pipeline_type,
          assigned_user_id,
          created_by,
          scheduled_for,
          notes,
          status,
          completed_at,
          appointment_outcome,
          outcome_recorded_at,
          outcome_notes,
          deal_value,
          monthly_recurring_value,
          deal_stage,
          follow_up_method,
          reschedule_count,
          outcome_reason,
          recording_url,
          phone_recording_url,
          booking_tier,
          booking_method,
          created_at,
          updated_at,
          contacts:contacts!pipeline_items_contact_id_fkey (
            id,
            business_name,
            contact_person,
            dm_name,
            industry,
            phone,
            state,
            website,
            gmb_link,
            ghl_contact_id,
            lead_type
          )
        `)
        .eq("contact_id", contactId!)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as PipelineItemWithRelations[];
    },
  });
}

/** Drop GHL-stream rows whose contact shares its GHL contact id with another dialer contact. */
async function dropSharedGhlContacts(rows: UnifiedMeetingLite[]): Promise<UnifiedMeetingLite[]> {
  const contactIds = [...new Set(rows.map((r) => r.contact_id).filter((id): id is string => !!id))];
  if (contactIds.length === 0) return rows;
  const { data: linked, error } = await supabase.from("contacts").select("id, ghl_contact_id").in("id", contactIds);
  if (error) throw error;
  const ghlByContact = new Map<string, string>();
  for (const c of linked ?? []) if (c.ghl_contact_id) ghlByContact.set(c.id, c.ghl_contact_id);
  const ghlIds = [...new Set(ghlByContact.values())];
  if (ghlIds.length === 0) return rows;
  const { data: sharing, error: sharingError } = await supabase.from("contacts").select("id, ghl_contact_id").in("ghl_contact_id", ghlIds);
  if (sharingError) throw sharingError;
  const holders = new Map<string, number>();
  for (const c of sharing ?? []) if (c.ghl_contact_id) holders.set(c.ghl_contact_id, (holders.get(c.ghl_contact_id) ?? 0) + 1);
  return rows.filter((r) => {
    const g = r.contact_id ? ghlByContact.get(r.contact_id) : undefined;
    return !g || (holders.get(g) ?? 0) <= 1;
  });
}

/** Local-day test used by both booking readers: created in range, or scheduled in range. */
function bookingInRange(from: string | undefined, to: string | undefined) {
  const toLocalDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  return (createdIso: string, scheduledIso: string | null) => {
    const createdDate = toLocalDate(createdIso);
    const scheduledDate = scheduledIso ? toLocalDate(scheduledIso) : null;
    const matchesCreatedRange = (!from || createdDate >= from) && (!to || createdDate <= to);
    const matchesScheduledRange = !!scheduledDate && (!from || scheduledDate >= from) && (!to || scheduledDate <= to);
    return matchesCreatedRange || matchesScheduledRange;
  };
}

/**
 * Everything the booked-appointments report is built from, for one date range.
 * Every lookup is by contact (calls, contact fields, verdicts, booking history),
 * so a wider range carries complete inputs for any narrower range inside it.
 */
export interface BookedRaw {
  dialer: BookedAppointmentReportItem[];
  ghl: UnifiedMeetingLite[];
  calls: Array<{ contact_id: string | null; user_id: string | null; created_at: string }>;
  contactsById: Map<string, NonNullable<BookedAppointmentReportItem["contacts"]>>;
  verdictRows: Array<{ contact_id: string; is_qualified: boolean | null }>;
  history: BookingHistoryRow[];
}

async function fetchBookedRaw(from?: string, to?: string): Promise<BookedRaw> {
  const buildQuery = () => {
    let query = supabase
      .from("pipeline_items")
      .select(
        "id, contact_id, created_at, created_by, assigned_user_id, scheduled_for, appointment_outcome, outcome_reason, dq_reason, outcome_recorded_at, status, deal_value, monthly_recurring_value, reschedule_count, is_qualified, pitched, proposal_status, proposal_sent_date, move_count, meeting_channel, resolved_bucket, booking_tier, booking_method, contacts:contacts!pipeline_items_contact_id_fkey(industry, state, trade_type, work_type, business_size, prospect_tier, buying_signal_strength, phone_type, has_google_ads, has_facebook_ads, dm_phone, gbp_rating, review_count, team_size, monthly_revenue)",
      )
      .eq("pipeline_type", "booked");

    // Server-side pre-filter with a ±1 day buffer (the precise local-date
    // range check stays authoritative). Previously this fetched EVERY
    // booked row and filtered in the browser.
    if (from && to) {
      const fromIso = new Date(new Date(`${from}T00:00:00`).getTime() - 86_400_000).toISOString();
      const toIso = new Date(new Date(`${to}T23:59:59`).getTime() + 86_400_000).toISOString();
      query = query.or(
        `and(created_at.gte.${fromIso},created_at.lte.${toIso}),and(scheduled_for.gte.${fromIso},scheduled_for.lte.${toIso})`,
      );
    }
    // created_at alone is not unique: id breaks ties so pages never skip or repeat rows.
    return query.order("created_at", { ascending: false }).order("id", { ascending: false });
  };

  // Paged: the API caps a response at 1,000 rows, and a year of bookings
  // (the Tracker's default range) can pass that.
  const fetchAllDialerRows = async () => {
    const PAGE = 1000;
    const rows: unknown[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await buildQuery().range(offset, offset + PAGE - 1);
      if (error) return { data: null, error };
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    return { data: rows, error: null };
  };

  // Dialer rows and calendar-only rows don't depend on each other: fetch both at once.
  const dialerPromise = fetchAllDialerRows();
  const inRange = bookingInRange(from, to);

  // Cold-call meetings that only exist in the GHL calendar (no dialer row).
  // See mergeMeetingStreams.ts for why ads bookings are excluded.
  let ghlQuery = supabase
    .from("v_meetings_unified")
    .select(
      "id, stream, contact_id, start_time, booked_at, rep_user_id, resolved_outcome, outcome_reason, reschedule_count, mrr, led_to_deal, channel, is_linked, meeting_type, title",
    )
    .eq("stream", "ghl")
    .eq("channel", "Cold Call")
    .eq("is_linked", true);
  if (from && to) {
    const fromIso = new Date(new Date(`${from}T00:00:00`).getTime() - 86_400_000).toISOString();
    const toIso = new Date(new Date(`${to}T23:59:59`).getTime() + 86_400_000).toISOString();
    ghlQuery = ghlQuery.or(
      `and(booked_at.gte.${fromIso},booked_at.lte.${toIso}),and(start_time.gte.${fromIso},start_time.lte.${toIso})`,
    );
  }
  const [{ data, error }, { data: ghlData, error: ghlError }] = await Promise.all([dialerPromise, ghlQuery]);
  if (error) throw error;
  if (ghlError) throw ghlError;
  const dialer = ((data ?? []) as BookedAppointmentReportItem[]).filter((item) => inRange(item.created_at, item.scheduled_for));
  const ghlRowsInRange = ((ghlData ?? []) as UnifiedMeetingLite[]).filter(
    (row) => !!row.start_time && inRange(row.booked_at ?? row.start_time!, row.start_time),
  );
  // Several dialer contacts can carry the same GHL contact id (a bad link
  // made when they were pushed to GHL). A GHL meeting on such a contact is
  // attached to an arbitrary business and usually duplicates a dialer row
  // on another contact, so it is left out until the links are cleaned.
  const ghl = await dropSharedGhlContacts(ghlRowsInRange);

  const ghlContactIds = [...new Set(ghl.map((r) => r.contact_id).filter((id): id is string => !!id))];
  // Verdicts live on dialer bookings, which may be outside the window; pull
  // them for the GHL contacts so a calendar-only sitting inherits the lead's
  // verdict. Independent of the other lookups, so they all run at once.
  const lookups = ghlContactIds.length
    ? Promise.all([
        supabase.from("call_logs").select("contact_id, user_id, created_at").in("contact_id", ghlContactIds),
        supabase
          .from("contacts")
          .select(
            "id, industry, state, trade_type, work_type, business_size, prospect_tier, buying_signal_strength, phone_type, has_google_ads, has_facebook_ads, dm_phone, gbp_rating, review_count, team_size, monthly_revenue",
          )
          .in("id", ghlContactIds),
        supabase
          .from("pipeline_items")
          .select("contact_id, is_qualified")
          .eq("pipeline_type", "booked")
          .in("contact_id", ghlContactIds)
          .not("is_qualified", "is", null),
      ])
    : null;

  // Follow-up (second) meetings need each contact's full booking history,
  // not just the rows inside the reporting window.
  const historyIds = [...new Set([...dialer.map((m) => m.contact_id), ...ghlContactIds])];
  const batches: string[][] = [];
  for (let i = 0; i < historyIds.length; i += 200) batches.push(historyIds.slice(i, i + 200));
  const historyPromise = Promise.all(
    batches.map((batch) =>
      supabase
        .from("pipeline_items")
        .select("id, contact_id, created_at, scheduled_for, appointment_outcome, resolved_bucket")
        .eq("pipeline_type", "booked")
        .in("contact_id", batch),
    ),
  );

  const [lookupResults, historyResults] = await Promise.all([lookups, historyPromise]);
  const history: BookingHistoryRow[] = [];
  for (const { data: hist, error: histError } of historyResults) {
    if (histError) throw histError;
    history.push(...((hist ?? []) as BookingHistoryRow[]));
  }

  const contactsById = new Map<string, NonNullable<BookedAppointmentReportItem["contacts"]>>();
  let calls: BookedRaw["calls"] = [];
  let verdictRows: BookedRaw["verdictRows"] = [];
  if (lookupResults) {
    const [callsRes, contactsRes, verdictRes] = lookupResults;
    if (callsRes.error) throw callsRes.error;
    if (contactsRes.error) throw contactsRes.error;
    if (verdictRes.error) throw verdictRes.error;
    calls = callsRes.data ?? [];
    for (const c of contactsRes.data ?? []) {
      const { id, ...rest } = c;
      contactsById.set(id, rest);
    }
    verdictRows = (verdictRes.data ?? []) as BookedRaw["verdictRows"];
  }
  return { dialer, ghl, calls, contactsById, verdictRows, history };
}

/** The booked-appointments report for [from, to], built from raw inputs for that range or any wider one. */
export function buildBookedReport(raw: BookedRaw, from?: string, to?: string) {
  const inRange = bookingInRange(from, to);
  const items = raw.dialer.filter((item) => inRange(item.created_at, item.scheduled_for));
  const ghlRows = raw.ghl.filter((row) => !!row.start_time && inRange(row.booked_at ?? row.start_time!, row.start_time));
  if (ghlRows.length === 0) return markFollowUpMeetings(items, raw.history);

  const ghlContacts = new Set(ghlRows.map((r) => r.contact_id).filter((id): id is string => !!id));
  const bookedAtByContact = new Map<string, string>();
  for (const r of ghlRows) {
    if (r.contact_id && r.booked_at) bookedAtByContact.set(r.contact_id, r.booked_at);
  }
  const bookers = inferBookers(raw.calls.filter((c) => !!c.contact_id && ghlContacts.has(c.contact_id)), bookedAtByContact);
  const verdictCarriers = raw.verdictRows
    .filter((r) => ghlContacts.has(r.contact_id))
    .map((r) => ({
      id: "", contact_id: r.contact_id, created_at: "", created_by: "", assigned_user_id: "", scheduled_for: null,
      appointment_outcome: null, outcome_recorded_at: null, status: "completed" as const, deal_value: null,
      monthly_recurring_value: null, reschedule_count: 0, is_qualified: r.is_qualified,
    })) as BookedAppointmentReportItem[];
  const mergedAll = mergeGhlOnlyMeetings([...items, ...verdictCarriers], ghlRows, bookers, raw.contactsById);
  // Drop the verdict carriers again; they were only there to seed the verdict map.
  return markFollowUpMeetings(mergedAll.filter((m) => m.id !== ""), raw.history);
}

/**
 * Booked appointments created or scheduled in [from, to]. With `within`, the
 * wider range's inputs are fetched once (shared by every card passing the same
 * window) and the report is built for [from, to] from them: the same result a
 * fetch of [from, to] gives, without a second set of requests.
 */
export function useBookedAppointmentsByDateRange(from?: string, to?: string, within?: { from: string; to: string }) {
  const fetchFrom = within ? within.from : from;
  const fetchTo = within ? within.to : to;
  const build = useCallback((raw: BookedRaw) => buildBookedReport(raw, from, to), [from, to]);
  return useQuery({
    queryKey: ["booked-appointments-range", "raw", fetchFrom, fetchTo],
    queryFn: () => fetchBookedRaw(fetchFrom, fetchTo),
    select: build,
  });
}

/**
 * Missed slots of moved meetings in a date range (public.meeting_reschedules,
 * kind 'move'), shaped like booked items so getReportMetrics can count each one
 * as "rescheduled" on the day it was missed. Entry errors (a dialer date typed
 * differently from the GHL booking made on the same call) are logged but not
 * counted. Pass the result to getReportMetrics({ rescheduleSlots }).
 */
export function useRescheduleSlotsByDateRange(from?: string, to?: string, within?: { from: string; to: string }) {
  const fetchFrom = within ? within.from : from;
  const fetchTo = within ? within.to : to;
  const build = useCallback((raw: RescheduleRaw) => buildRescheduleSlots(raw, from, to), [from, to]);
  return useQuery({
    queryKey: ["reschedule-slots-range", "raw", fetchFrom, fetchTo],
    queryFn: () => fetchRescheduleRaw(fetchFrom, fetchTo),
    select: build,
  });
}

export interface RescheduleRaw {
  slots: BookedAppointmentReportItem[];
  history: BookingHistoryRow[];
}

const slotLocalDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Slots for [from, to] (local day missed), from raw inputs for that range or a wider one. */
export function buildRescheduleSlots(raw: RescheduleRaw, from?: string, to?: string) {
  const slots = raw.slots.filter((s) => {
    const day = slotLocalDay(s.scheduled_for!);
    return (!from || day >= from) && (!to || day <= to);
  });
  if (slots.length === 0) return slots as ReturnType<typeof markFollowUpMeetings<BookedAppointmentReportItem>>;
  // A slot with a lead who had already sat is a second-meeting slot.
  return markFollowUpMeetings(slots, raw.history);
}

async function fetchRescheduleRaw(from?: string, to?: string): Promise<RescheduleRaw> {
  {
      let query = supabase
        .from("meeting_reschedules")
        .select(
          "id, from_scheduled_for, reason, kind, pipeline_items!inner(contact_id, created_at, created_by, assigned_user_id, pipeline_type, meeting_channel, booking_tier, booking_method, contacts:contacts!pipeline_items_contact_id_fkey(industry, state, trade_type, work_type, business_size, prospect_tier, buying_signal_strength, phone_type, has_google_ads, has_facebook_ads, dm_phone, gbp_rating, review_count, team_size, monthly_revenue))",
        )
        .eq("kind", "move");
      if (from && to) {
        const fromIso = new Date(new Date(`${from}T00:00:00`).getTime() - 86_400_000).toISOString();
        const toIso = new Date(new Date(`${to}T23:59:59`).getTime() + 86_400_000).toISOString();
        query = query.gte("from_scheduled_for", fromIso).lte("from_scheduled_for", toIso);
      }
      const { data, error } = await query;
      if (error) throw error;

      const toLocalDate = (iso: string) => {
        const d = new Date(iso);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      };
      type SlotRow = {
        id: string;
        from_scheduled_for: string;
        reason: string | null;
        pipeline_items: {
          contact_id: string;
          created_at: string;
          created_by: string;
          assigned_user_id: string;
          pipeline_type: string;
          meeting_channel?: string | null;
          booking_tier?: string | null;
          booking_method?: string | null;
          contacts: BookedAppointmentReportItem["contacts"];
        } | null;
      };
      const slots: BookedAppointmentReportItem[] = ((data ?? []) as unknown as SlotRow[])
        .filter((r) => !!r.pipeline_items && r.pipeline_items.pipeline_type === "booked")
        .filter((r) => {
          const day = toLocalDate(r.from_scheduled_for);
          return (!from || day >= from) && (!to || day <= to);
        })
        .map((r) => ({
          id: `reschedule:${r.id}`,
          contact_id: r.pipeline_items!.contact_id,
          created_at: r.pipeline_items!.created_at,
          created_by: r.pipeline_items!.created_by,
          assigned_user_id: r.pipeline_items!.assigned_user_id,
          scheduled_for: r.from_scheduled_for,
          appointment_outcome: "rescheduled",
          outcome_recorded_at: null,
          status: "completed",
          deal_value: null,
          monthly_recurring_value: null,
          reschedule_count: 0,
          outcome_reason: r.reason,
          is_qualified: null,
          stream: "dialer",
          resolved_bucket: "rescheduled",
          is_reschedule_slot: true,
          contacts: r.pipeline_items!.contacts,
          meeting_channel: r.pipeline_items!.meeting_channel ?? null,
          booking_tier: r.pipeline_items!.booking_tier ?? null,
          booking_method: r.pipeline_items!.booking_method ?? null,
        }) as BookedAppointmentReportItem);
      if (slots.length === 0) return { slots, history: [] };

      const ids = [...new Set(slots.map((s) => s.contact_id))];
      const history: BookingHistoryRow[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data: hist, error: histError } = await supabase
          .from("pipeline_items")
          .select("id, contact_id, created_at, scheduled_for, appointment_outcome, resolved_bucket")
          .eq("pipeline_type", "booked")
          .in("contact_id", ids.slice(i, i + 200));
        if (histError) throw histError;
        history.push(...((hist ?? []) as BookingHistoryRow[]));
      }
      return { slots, history };
  }
}

export function useCreatePipelineItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: PipelineItemInsert) => {
      const { data, error } = await supabase
        .from("pipeline_items")
        .insert({
          notes: "",
          status: "open",
          ...Object.fromEntries(
            Object.entries(payload).filter(([k]) => !["ghl_opportunity_id", "ghl_pipeline_id", "ghl_stage_id"].includes(k))
          ),
        } as any)
        .select("id")
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ["pipeline-items"] });
      const tempId = `optimistic-${crypto.randomUUID()}`;
      const nowIso = new Date().toISOString();
      const optimisticItem: PipelineItemWithRelations = {
        id: tempId,
        contact_id: payload.contact_id,
        source_call_log_id: payload.source_call_log_id ?? null,
        pipeline_type: payload.pipeline_type,
        assigned_user_id: payload.assigned_user_id,
        created_by: payload.created_by,
        scheduled_for: payload.scheduled_for ?? null,
        notes: payload.notes ?? "",
        status: payload.status ?? "open",
        completed_at: null,
        appointment_outcome: null,
        outcome_recorded_at: null,
        outcome_notes: "",
        deal_value: null,
        monthly_recurring_value: null,
        deal_stage: null,
        follow_up_method: (payload.follow_up_method ?? "call") as FollowUpMethod,
        ghl_opportunity_id: null,
        ghl_pipeline_id: null,
        ghl_stage_id: null,
        reschedule_count: 0,
        created_at: nowIso,
        updated_at: nowIso,
        contacts: null,
      };

      const listKey = ["pipeline-items", payload.pipeline_type, payload.status ?? "open"] as const;
      const contactKey = ["pipeline-items", "contact", payload.contact_id] as const;

      const previousList = queryClient.getQueryData<PipelineItemWithRelations[]>(listKey);
      const previousContactList = queryClient.getQueryData<PipelineItemWithRelations[]>(contactKey);

      if (previousList) {
        queryClient.setQueryData<PipelineItemWithRelations[]>(listKey, [optimisticItem, ...previousList]);
      }
      if (previousContactList) {
        queryClient.setQueryData<PipelineItemWithRelations[]>(contactKey, [optimisticItem, ...previousContactList]);
      }

      return { tempId, listKey, contactKey, previousList, previousContactList };
    },
    onError: (_error, _payload, context) => {
      if (!context) return;
      if (context.previousList) queryClient.setQueryData(context.listKey, context.previousList);
      if (context.previousContactList) queryClient.setQueryData(context.contactKey, context.previousContactList);
      console.error("[useCreatePipelineItem] Failed to create pipeline item:", _error);
    },
    onSettled: (_data, _error, payload) => {
      // Precise invalidation — just the two lists we touched, plus booked-range if relevant.
      queryClient.invalidateQueries({ queryKey: ["pipeline-items", payload.pipeline_type, payload.status ?? "open"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-items", "contact", payload.contact_id] });
      if (payload.pipeline_type === "booked") {
        queryClient.invalidateQueries({ queryKey: ["booked-appointments-range"] });
      }
    },
  });
}

export function useUpdatePipelineItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: PipelineItemUpdate) => {
      const { ghl_opportunity_id, ghl_pipeline_id, ghl_stage_id, ...dbUpdates } = updates as any;
      const { error } = await supabase.from("pipeline_items").update(dbUpdates).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, ...updates }) => {
      await queryClient.cancelQueries({ queryKey: ["pipeline-items"] });

      const previous = queryClient.getQueriesData<PipelineItemWithRelations[]>({ queryKey: ["pipeline-items"] });
      const patch = updates as Partial<PipelineItemWithRelations>;

      queryClient.setQueriesData<PipelineItemWithRelations[]>({ queryKey: ["pipeline-items"] }, (list) => {
        if (!list) return list;
        return list.map((item) => (item.id === id ? { ...item, ...patch, updated_at: new Date().toISOString() } : item));
      });

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) queryClient.setQueryData(key, data);
      }
      console.error("[useUpdatePipelineItem] Failed to update pipeline item:", _error);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-items"] });
      queryClient.invalidateQueries({ queryKey: ["booked-appointments-range"] });
    },
  });
}

/** Every booking a setter made in the last 12 months, with their own ratings (booking tracker). */
export function useMyBookings(setterId?: string) {
  return useQuery({
    queryKey: ["my-bookings", setterId],
    enabled: !!setterId,
    staleTime: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 366 * 86_400_000).toISOString();
      const items: import("@/lib/bookingTracker").MyBookingSource[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase
          .from("pipeline_items")
          .select("id, contact_id, created_at, scheduled_for, resolved_bucket, reschedule_count, move_count, contacts:contacts!pipeline_items_contact_id_fkey(business_name, contact_person)")
          .eq("pipeline_type", "booked")
          .eq("created_by", setterId!)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(offset, offset + 999);
        if (error) throw error;
        items.push(...((data ?? []) as unknown as import("@/lib/bookingTracker").MyBookingSource[]));
        if (!data || data.length < 1000) break;
      }
      const { data: ratingRows, error: ratingError } = await (supabase.from as unknown as (t: string) => {
        select: (c: string) => { eq: (k: string, v: string) => Promise<{ data: Array<{ pipeline_item_id: string; rating: number }> | null; error: unknown }> };
      })("booking_ratings").select("pipeline_item_id, rating").eq("user_id", setterId!);
      if (ratingError) throw ratingError;
      const ratings = new Map((ratingRows ?? []).map((r) => [r.pipeline_item_id, Number(r.rating)] as const));
      return { items, ratings };
    },
  });
}

/** Set (1 to 5) or clear (null) the signed-in setter's rating of one of their bookings. */
export function useRateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ pipelineItemId, rating }: { pipelineItemId: string; rating: number | null }) => {
      const table = (supabase.from as unknown as (t: string) => {
        upsert: (r: unknown, o: unknown) => Promise<{ error: unknown }>;
        delete: () => { eq: (k: string, v: string) => Promise<{ error: unknown }> };
      })("booking_ratings");
      const { error } = rating == null
        ? await table.delete().eq("pipeline_item_id", pipelineItemId)
        : await table.upsert({ pipeline_item_id: pipelineItemId, rating, updated_at: new Date().toISOString() }, { onConflict: "pipeline_item_id" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["my-bookings"] }),
  });
}
