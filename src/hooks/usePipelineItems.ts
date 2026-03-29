import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppointmentOutcomeValue } from "@/lib/appointments";

export type PipelineType = "follow_up" | "booked";
export type PipelineStatus = "open" | "completed" | "canceled";
export type FollowUpMethod = "call" | "email" | "prospecting";

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
}

export interface PipelineItemUpdate {
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
  follow_up_method?: FollowUpMethod;
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
  follow_up_method: FollowUpMethod;
  reschedule_count: number;
  created_at: string;
  updated_at: string;
  contacts: {
    id: string;
    business_name: string;
    contact_person: string | null;
    industry: string;
    phone: string;
    state: string | null;
    website: string | null;
    gmb_link: string | null;
    ghl_contact_id: string | null;
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
  reschedule_count: number;
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
          follow_up_method,
          reschedule_count,
          created_at,
          updated_at,
          contacts:contacts!pipeline_items_contact_id_fkey (
            id,
            business_name,
            contact_person,
            industry,
            phone,
            state,
            website,
            gmb_link,
            ghl_contact_id
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
      return (data ?? []) as PipelineItemWithRelations[];
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
          follow_up_method,
          reschedule_count,
          created_at,
          updated_at,
          contacts:contacts!pipeline_items_contact_id_fkey (
            id,
            business_name,
            contact_person,
            industry,
            phone,
            state,
            website,
            gmb_link,
            ghl_contact_id
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
      const { data, error } = await supabase
        .from("pipeline_items")
        .select(
          "id, contact_id, created_at, created_by, assigned_user_id, scheduled_for, appointment_outcome, outcome_recorded_at, status, deal_value, reschedule_count",
        )
        .eq("pipeline_type", "booked")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const items = (data ?? []) as BookedAppointmentReportItem[];
      return items.filter((item) => {
        // Compare using local date representations for timezone correctness
        const toLocalDate = (iso: string) => {
          const d = new Date(iso);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        };
        const createdDate = toLocalDate(item.created_at);
        const scheduledDate = item.scheduled_for ? toLocalDate(item.scheduled_for) : null;

        const matchesCreatedRange = (!from || createdDate >= from) && (!to || createdDate <= to);
        const matchesScheduledRange =
          !!scheduledDate && (!from || scheduledDate >= from) && (!to || scheduledDate <= to);

        return matchesCreatedRange || matchesScheduledRange;
      });
    },
  });
}

export function useCreatePipelineItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: PipelineItemInsert) => {
      const { error } = await supabase.from("pipeline_items").insert({
        notes: "",
        status: "open",
        ...payload,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-items"] });
      queryClient.invalidateQueries({ queryKey: ["booked-appointments-range"] });
    },
    onError: (error) => {
      console.error("[useCreatePipelineItem] Failed to create pipeline item:", error);
    },
  });
}

export function useUpdatePipelineItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: PipelineItemUpdate) => {
      const { error } = await supabase.from("pipeline_items").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-items"] });
      queryClient.invalidateQueries({ queryKey: ["booked-appointments-range"] });
    },
    onError: (error) => {
      console.error("[useUpdatePipelineItem] Failed to update pipeline item:", error);
    },
  });
}
