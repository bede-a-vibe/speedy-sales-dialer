import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Meetings across BOTH booking streams:
 *   'ghl'    — GHL calendar bookings (ads / inbound), synced every 15 min
 *   'dialer' — pipeline_items of type 'booked' (cold outbound)
 *
 * Reporting has to span both. The GHL stream carries the volume, the dialer
 * stream carries almost all of the dispositions and every closed deal to date.
 */
export type MeetingStream = "ghl" | "dialer";

/** Resolved outcome. 'pending' = the meeting has happened and nobody said what occurred. */
export type MeetingOutcome =
  | "showed"
  | "noshow"
  | "cancelled"
  | "rescheduled"
  | "invalid"
  | "upcoming"
  | "pending";

/** Outcomes a rep can record against a GHL meeting. */
export const DISPOSITION_OPTIONS: { value: MeetingOutcome; label: string }[] = [
  { value: "showed", label: "Showed" },
  { value: "noshow", label: "No-show" },
  { value: "cancelled", label: "Cancelled" },
  { value: "rescheduled", label: "Rescheduled" },
];

export interface MeetingRow {
  id: string;
  stream: MeetingStream;
  contact_id: string | null;
  meeting_type: string | null;
  title: string | null;
  start_time: string | null;
  booked_at: string | null;
  assigned_user_id: string | null;
  ghl_user_id: string | null;
  meeting_link: string | null;
  resolved_outcome: MeetingOutcome;
  dialer_dispositioned: boolean;
  channel: string;
  source: string;
  is_linked: boolean;
  business_name: string | null;
  contact_person: string | null;
  phone: string | null;
  lifecycle_stage: string | null;
  owner_id: string | null;
  first_deal_at: string | null;
  total_amount: number | null;
  mrr: number | null;
  led_to_deal: boolean;
}

export interface SourceFunnelRow {
  channel: string;
  source: string;
  meetings_booked: number;
  showed: number;
  noshow: number;
  cancelled: number;
  pending: number;
  upcoming: number;
  contacts_booked: number;
  contacts_showed: number;
  contacts_won: number;
  total_amount: number;
  mrr: number;
  show_rate_pct: number | null;
  close_from_show_pct: number | null;
  close_from_booked_pct: number | null;
}

export type FunnelBasis = "scheduled" | "booked";
export type FunnelGroup = "channel" | "source";

interface FunnelArgs {
  from: string;
  to: string;
  basis?: FunnelBasis;
  group?: FunnelGroup;
  stream?: MeetingStream | "all";
}

/**
 * Show rate / close rate per lead source.
 *   basis 'scheduled' buckets by meeting date  — the right basis for show rate.
 *   basis 'booked'    buckets by booking date  — the right basis for lead-gen volume.
 */
export function useSourceFunnel({ from, to, basis = "scheduled", group = "channel", stream = "all" }: FunnelArgs) {
  return useQuery({
    queryKey: ["source-funnel", from, to, basis, group, stream],
    queryFn: async (): Promise<SourceFunnelRow[]> => {
      const { data, error } = await supabase.rpc("get_source_funnel", {
        _from: new Date(`${from}T00:00:00`).toISOString(),
        _to: new Date(`${to}T23:59:59.999`).toISOString(),
        _basis: basis,
        _group: group,
        _stream: stream,
      });
      if (error) throw error;
      return (data ?? []) as SourceFunnelRow[];
    },
    staleTime: 60_000,
  });
}

interface MeetingsArgs {
  from?: string;
  to?: string;
  outcomes?: MeetingOutcome[];
  stream?: MeetingStream | "all";
  limit?: number;
}

export function useMeetings({ from, to, outcomes, stream = "all", limit = 500 }: MeetingsArgs = {}) {
  return useQuery({
    queryKey: ["meetings", from, to, outcomes, stream, limit],
    queryFn: async (): Promise<MeetingRow[]> => {
      let query = supabase
        .from("v_meetings_unified")
        .select("*")
        .order("start_time", { ascending: false })
        .limit(limit);

      if (from) query = query.gte("start_time", new Date(`${from}T00:00:00`).toISOString());
      if (to) query = query.lte("start_time", new Date(`${to}T23:59:59.999`).toISOString());
      if (stream !== "all") query = query.eq("stream", stream);
      if (outcomes?.length) query = query.in("resolved_outcome", outcomes);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as MeetingRow[];
    },
    staleTime: 30_000,
  });
}

/**
 * Past meetings nobody has dispositioned. This is the queue that has to be
 * cleared for show rate to mean anything — every row here is excluded from the
 * show-rate denominator, because "unknown" is not the same as "no-show".
 */
export function useMeetingsNeedingDisposition(limit = 500) {
  return useQuery({
    queryKey: ["meetings-needing-disposition", limit],
    queryFn: async (): Promise<MeetingRow[]> => {
      const { data, error } = await supabase
        .from("v_meetings_unified")
        .select("*")
        .eq("resolved_outcome", "pending")
        .order("start_time", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as MeetingRow[];
    },
    staleTime: 30_000,
  });
}

export function useUpcomingMeetings(limit = 200) {
  return useQuery({
    queryKey: ["meetings-upcoming", limit],
    queryFn: async (): Promise<MeetingRow[]> => {
      const { data, error } = await supabase
        .from("v_meetings_unified")
        .select("*")
        .eq("resolved_outcome", "upcoming")
        .order("start_time", { ascending: true })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as MeetingRow[];
    },
    staleTime: 30_000,
  });
}

function invalidateMeetingCaches(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["meetings"] });
  queryClient.invalidateQueries({ queryKey: ["meetings-needing-disposition"] });
  queryClient.invalidateQueries({ queryKey: ["meetings-upcoming"] });
  queryClient.invalidateQueries({ queryKey: ["source-funnel"] });
}

/**
 * Record an outcome against a GHL-stream meeting.
 *
 * Writes to ghl_appointments.outcome, NOT appointment_status: the 15-minute
 * sync_ghl_appointments upsert overwrites appointment_status from GHL and would
 * otherwise wipe the rep's disposition on the next run.
 *
 * Dialer-stream meetings are deliberately not handled here — they already have a
 * richer outcome enum (showed_closed / showed_verbal_commitment / showed_no_close
 * / no_close_follow_up) recorded through the pipeline UI, and flattening that to
 * "showed" would throw away the close detail the Clients page depends on.
 */
export function useSetMeetingOutcome() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      meetingId,
      stream,
      outcome,
      notes,
    }: {
      meetingId: string;
      stream: MeetingStream;
      outcome: MeetingOutcome | null;
      notes?: string;
    }) => {
      if (stream !== "ghl") {
        throw new Error("Dialer bookings are dispositioned from the pipeline, not here.");
      }
      const { error } = await supabase.rpc("set_appointment_outcome", {
        _appointment_id: meetingId,
        _outcome: outcome as string,
        _notes: notes,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateMeetingCaches(queryClient),
  });
}
