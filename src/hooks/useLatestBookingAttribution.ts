import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSalesReps } from "@/hooks/usePipelineItems";
import type { DerivedBookingField } from "@/lib/ghlFieldFolders";

interface LatestBookingRow {
  created_by: string | null;
  assigned_user_id: string | null;
  source_call_log_id: string | null;
}

/**
 * Setter, closer, source and set-by role of a lead's latest booked meeting:
 * the Appointments attribution fields, worked out from pipeline_items so
 * they always match the meeting itself.
 */
export function useLatestBookingAttribution(contactId: string | null): Partial<Record<DerivedBookingField, string>> {
  const { data: reps = [] } = useSalesReps();
  const { data: booking } = useQuery({
    queryKey: ["latest-booking-attribution", contactId],
    enabled: Boolean(contactId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_items")
        .select("created_by, assigned_user_id, source_call_log_id")
        .eq("contact_id", contactId as string)
        .eq("pipeline_type", "booked")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as LatestBookingRow | null;
    },
  });

  if (!booking) return {};
  const name = (id: string | null) => {
    if (!id) return undefined;
    const rep = reps.find((r) => r.user_id === id);
    return rep?.display_name || rep?.email?.split("@")[0] || undefined;
  };
  const out: Partial<Record<DerivedBookingField, string>> = {
    setter_name: name(booking.created_by),
    assigned_closer: name(booking.assigned_user_id),
    meeting_source: booking.source_call_log_id ? "Dialer call" : "GHL calendar",
  };
  if (booking.created_by && booking.assigned_user_id) {
    out.meeting_set_by_role = booking.created_by === booking.assigned_user_id ? "Closer (self-booked)" : "Setter";
  }
  return out;
}
