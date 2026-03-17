import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PipelineType = "follow_up" | "booked";
export type PipelineStatus = "open" | "completed" | "canceled";

export interface PipelineItemInsert {
  contact_id: string;
  source_call_log_id?: string | null;
  pipeline_type: PipelineType;
  assigned_user_id: string;
  created_by: string;
  scheduled_for?: string | null;
  notes?: string;
  status?: PipelineStatus;
}

export interface PipelineItemUpdate {
  id: string;
  assigned_user_id?: string;
  scheduled_for?: string | null;
  status?: PipelineStatus;
  notes?: string;
  completed_at?: string | null;
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
  created_at: string;
  updated_at: string;
  contacts: {
    id: string;
    business_name: string;
    contact_person: string | null;
    industry: string;
    phone: string;
    state: string | null;
  } | null;
}

export interface SalesRepOption {
  user_id: string;
  display_name: string | null;
  email: string | null;
}

export function usePipelineItems(type: PipelineType) {
  return useQuery({
    queryKey: ["pipeline-items", type],
    queryFn: async () => {
      let query = supabase
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
          created_at,
          updated_at,
          contacts:contacts!pipeline_items_contact_id_fkey (
            id,
            business_name,
            contact_person,
            industry,
            phone,
            state
          )
        `)
        .eq("pipeline_type", type)
        .eq("status", "open");

      query = type === "follow_up"
        ? query.order("scheduled_for", { ascending: true, nullsFirst: false })
        : query.order("created_at", { ascending: false });

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
    },
  });
}
