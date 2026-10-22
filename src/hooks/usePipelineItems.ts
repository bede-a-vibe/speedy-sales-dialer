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
          outcome_reason,
          recording_url,
          phone_recording_url,
          meeting_ghl_opportunity_id,
          meeting_ghl_stage_id,
          ghl_sync_error,
          ghl_stage_synced_at,
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

export function useBookedAppointmentsByDateRange(from?: string, to?: string) {
  return useQuery({
    queryKey: ["booked-appointments-range", from, to],
    queryFn: async () => {
      let query = supabase
        .from("pipeline_items")
        .select(
          "id, contact_id, created_at, created_by, assigned_user_id, scheduled_for, appointment_outcome, outcome_reason, dq_reason, outcome_recorded_at, status, deal_value, monthly_recurring_value, reschedule_count, is_qualified, resolved_bucket, contacts:contacts!pipeline_items_contact_id_fkey(industry, state, trade_type, work_type, business_size, prospect_tier, buying_signal_strength, phone_type, has_google_ads, has_facebook_ads, dm_phone, gbp_rating, review_count)",
        )
        .eq("pipeline_type", "booked");

      // Server-side pre-filter with a ±1 day buffer (the precise local-date
      // range check below stays authoritative). Previously this fetched EVERY
      // booked row and filtered in the browser.
      if (from && to) {
        const fromIso = new Date(new Date(`${from}T00:00:00`).getTime() - 86_400_000).toISOString();
        const toIso = new Date(new Date(`${to}T23:59:59`).getTime() + 86_400_000).toISOString();
        query = query.or(
          `and(created_at.gte.${fromIso},created_at.lte.${toIso}),and(scheduled_for.gte.${fromIso},scheduled_for.lte.${toIso})`,
        );
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) throw error;

      // Compare using local date representations for timezone correctness
      const toLocalDate = (iso: string) => {
        const d = new Date(iso);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      };
      const inRange = (createdIso: string, scheduledIso: string | null) => {
        const createdDate = toLocalDate(createdIso);
        const scheduledDate = scheduledIso ? toLocalDate(scheduledIso) : null;
        const matchesCreatedRange = (!from || createdDate >= from) && (!to || createdDate <= to);
        const matchesScheduledRange =
          !!scheduledDate && (!from || scheduledDate >= from) && (!to || scheduledDate <= to);
        return matchesCreatedRange || matchesScheduledRange;
      };

      const items = ((data ?? []) as BookedAppointmentReportItem[]).filter((item) =>
        inRange(item.created_at, item.scheduled_for),
      );

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
      const { data: ghlData, error: ghlError } = await ghlQuery;
      if (ghlError) throw ghlError;
      const ghlRows = ((ghlData ?? []) as UnifiedMeetingLite[]).filter(
        (row) => !!row.start_time && inRange(row.booked_at ?? row.start_time!, row.start_time),
      );
      // Follow-up (second) meetings need each contact's full booking history,
      // not just the rows inside the reporting window.
      const withFollowUps = async (merged: BookedAppointmentReportItem[]) => {
        const ids = [...new Set(merged.map((m) => m.contact_id))];
        const history: BookingHistoryRow[] = [];
        for (let i = 0; i < ids.length; i += 200) {
          const { data: hist, error: histError } = await supabase
            .from("pipeline_items")
            .select("id, contact_id, scheduled_for, appointment_outcome, resolved_bucket")
            .eq("pipeline_type", "booked")
            .in("contact_id", ids.slice(i, i + 200));
          if (histError) throw histError;
          history.push(...((hist ?? []) as BookingHistoryRow[]));
        }
        return markFollowUpMeetings(merged, history);
      };

      if (ghlRows.length === 0) return withFollowUps(items);

      const ghlContactIds = [...new Set(ghlRows.map((r) => r.contact_id).filter((id): id is string => !!id))];
      const bookedAtByContact = new Map<string, string>();
      for (const r of ghlRows) {
        if (r.contact_id && r.booked_at) bookedAtByContact.set(r.contact_id, r.booked_at);
      }
      const [callsRes, contactsRes] = await Promise.all([
        supabase.from("call_logs").select("contact_id, user_id, created_at").in("contact_id", ghlContactIds),
        supabase
          .from("contacts")
          .select(
            "id, industry, state, trade_type, work_type, business_size, prospect_tier, buying_signal_strength, phone_type, has_google_ads, has_facebook_ads, dm_phone, gbp_rating, review_count",
          )
          .in("id", ghlContactIds),
      ]);
      if (callsRes.error) throw callsRes.error;
      if (contactsRes.error) throw contactsRes.error;
      const bookers = inferBookers(callsRes.data ?? [], bookedAtByContact);
      const contactsById = new Map<string, NonNullable<BookedAppointmentReportItem["contacts"]>>();
      for (const c of contactsRes.data ?? []) {
        const { id, ...rest } = c;
        contactsById.set(id, rest);
      }
      // Verdicts live on dialer bookings, which may be outside the window; pull
      // them for the GHL contacts so a calendar-only sitting inherits the lead's verdict.
      const { data: verdictRows, error: verdictError } = await supabase
        .from("pipeline_items")
        .select("contact_id, is_qualified")
        .eq("pipeline_type", "booked")
        .in("contact_id", ghlContactIds)
        .not("is_qualified", "is", null);
      if (verdictError) throw verdictError;
      const verdictCarriers = (verdictRows ?? []).map((r) => ({
        id: "", contact_id: r.contact_id, created_at: "", created_by: "", assigned_user_id: "", scheduled_for: null,
        appointment_outcome: null, outcome_recorded_at: null, status: "completed" as const, deal_value: null,
        monthly_recurring_value: null, reschedule_count: 0, is_qualified: r.is_qualified,
      })) as BookedAppointmentReportItem[];
      const mergedAll = mergeGhlOnlyMeetings([...items, ...verdictCarriers], ghlRows, bookers, contactsById);
      // Drop the verdict carriers again; they were only there to seed the verdict map.
      return withFollowUps(mergedAll.filter((m) => m.id !== ""));
    },
  });
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
