import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { MeetingOutcome, RecordableOutcome } from "@/lib/meetingOutcomes";

/**
 * Meetings across BOTH booking streams:
 *   'ghl'    — GHL calendar bookings (ads / inbound), synced every 15 min
 *   'dialer' — pipeline_items of type 'booked' (cold outbound)
 *
 * The GHL stream carries the volume; the dialer stream carries almost all of the
 * dispositions and every closed deal to date. Reporting has to span both.
 */
export type MeetingStream = "ghl" | "dialer";

export interface MeetingRow {
  id: string;
  stream: MeetingStream;
  contact_id: string | null;
  meeting_type: string | null;
  title: string | null;
  start_time: string | null;
  booked_at: string | null;
  original_start_time: string | null;
  reschedule_count: number;
  assigned_user_id: string | null;
  ghl_user_id: string | null;
  rep_name: string;
  rep_user_id: string | null;
  meeting_link: string | null;
  resolved_outcome: MeetingOutcome;
  outcome_reason: string | null;
  outcome_notes: string | null;
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
  rescheduled: number;
  reschedules: number;
  pending: number;
  upcoming: number;
  contacts_booked: number;
  contacts_showed: number;
  contacts_won: number;
  total_amount: number;
  mrr: number;
  show_rate_pct: number | null;
  reschedule_rate_pct: number | null;
  close_from_show_pct: number | null;
  close_from_booked_pct: number | null;
}

export interface RepMeetingStats {
  ghl_user_id: string | null;
  rep_name: string;
  rep_user_id: string | null;
  has_dialer_account: boolean;
  meetings_booked: number;
  showed: number;
  noshow: number;
  cancelled: number;
  rescheduled: number;
  reschedules: number;
  pending: number;
  upcoming: number;
  contacts_won: number;
  show_rate_pct: number | null;
  reschedule_rate_pct: number | null;
}

export type FunnelBasis = "scheduled" | "booked";
export type FunnelGroup = "channel" | "source";

function toIso(date: string, endOfDay = false) {
  return new Date(`${date}T${endOfDay ? "23:59:59.999" : "00:00:00"}`).toISOString();
}

/**
 * Show rate / close rate per lead source.
 *   basis 'scheduled' buckets by meeting date  — the right basis for show rate.
 *   basis 'booked'    buckets by booking date  — the right basis for lead-gen volume.
 */
export function useSourceFunnel({
  from,
  to,
  basis = "scheduled",
  group = "channel",
  stream = "all",
}: {
  from: string;
  to: string;
  basis?: FunnelBasis;
  group?: FunnelGroup;
  stream?: MeetingStream | "all";
}) {
  return useQuery({
    queryKey: ["source-funnel", from, to, basis, group, stream],
    queryFn: async (): Promise<SourceFunnelRow[]> => {
      const { data, error } = await supabase.rpc("get_source_funnel", {
        _from: toIso(from),
        _to: toIso(to, true),
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

/** Per-rep meeting performance, and whether that rep can even log in yet. */
export function useRepMeetingStats(from: string, to: string) {
  return useQuery({
    queryKey: ["rep-meeting-stats", from, to],
    queryFn: async (): Promise<RepMeetingStats[]> => {
      const { data, error } = await supabase.rpc("get_rep_meeting_stats", {
        _from: toIso(from),
        _to: toIso(to, true),
      });
      if (error) throw error;
      return (data ?? []) as RepMeetingStats[];
    },
    staleTime: 60_000,
  });
}

/** The signed-in user's GHL user id, used to show a rep only their own calendar. */
export function useMyGhlUserId() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-ghl-user-id", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("ghl_user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      return data?.ghl_user_id ?? null;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

interface MeetingQueryArgs {
  outcomes?: MeetingOutcome[];
  /** Restrict to one rep's calendar. Pass null to show everyone's. */
  ghlUserId?: string | null;
  myUserId?: string | null;
  ascending?: boolean;
  limit?: number;
  enabled?: boolean;
}

function useMeetingQuery(key: string, args: MeetingQueryArgs) {
  const { outcomes, ghlUserId, myUserId, ascending = false, limit = 500, enabled = true } = args;

  return useQuery({
    queryKey: [key, outcomes, ghlUserId, myUserId, ascending, limit],
    queryFn: async (): Promise<MeetingRow[]> => {
      let query = supabase
        .from("v_meetings_unified")
        .select("*")
        .order("start_time", { ascending })
        .limit(limit);

      if (outcomes?.length) query = query.in("resolved_outcome", outcomes);

      // A rep owns a meeting through either identity: the GHL calendar it was
      // booked on, or the dialer user it was assigned to. Filtering on only one
      // would hide half of a rep's day.
      if (ghlUserId && myUserId) {
        query = query.or(`ghl_user_id.eq.${ghlUserId},rep_user_id.eq.${myUserId}`);
      } else if (ghlUserId) {
        query = query.eq("ghl_user_id", ghlUserId);
      } else if (myUserId) {
        query = query.eq("rep_user_id", myUserId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as MeetingRow[];
    },
    staleTime: 30_000,
    enabled,
  });
}

/**
 * Past meetings nobody has dispositioned. Every row here is excluded from the
 * show-rate denominator, so clearing this queue is what makes the reporting real.
 */
export function useMeetingsNeedingOutcome(args: MeetingQueryArgs = {}) {
  return useMeetingQuery("meetings-pending", { ...args, outcomes: ["pending"] });
}

export function useUpcomingMeetings(args: MeetingQueryArgs = {}) {
  return useMeetingQuery("meetings-upcoming", {
    ...args,
    outcomes: ["upcoming"],
    ascending: true,
    limit: args.limit ?? 200,
  });
}

export function useRecentMeetings(args: MeetingQueryArgs = {}) {
  return useMeetingQuery("meetings-recent", {
    ...args,
    outcomes: ["showed", "noshow", "cancelled", "rescheduled"],
    limit: args.limit ?? 200,
  });
}

/** Audit trail for one meeting, including every time it moved. */
export function useMeetingOutcomeLog(appointmentId: string | null) {
  return useQuery({
    queryKey: ["meeting-outcome-log", appointmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meeting_outcome_log")
        .select("*")
        .eq("appointment_id", appointmentId!)
        .order("recorded_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!appointmentId,
    staleTime: 30_000,
  });
}

/**
 * Record an outcome against a GHL-stream meeting.
 *
 * Writes to ghl_appointments.outcome, NOT appointment_status: the 15-minute
 * sync_ghl_appointments upsert overwrites appointment_status from GHL and would
 * otherwise wipe the rep's disposition on the next run.
 *
 * Dialer-stream meetings are deliberately not handled here — they already carry a
 * richer outcome enum (showed_closed / showed_verbal_commitment / showed_no_close
 * / no_close_follow_up) recorded through the pipeline UI, and flattening that to
 * "showed" would throw away the close detail the Clients page reads.
 */
export function useSetMeetingOutcome() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      meetingId,
      stream,
      outcome,
      reason,
      notes,
    }: {
      meetingId: string;
      stream: MeetingStream;
      outcome: RecordableOutcome;
      reason?: string | null;
      notes?: string | null;
    }) => {
      if (stream !== "ghl") {
        throw new Error("Dialer bookings are dispositioned from the pipeline, not here.");
      }
      const { error } = await supabase.rpc("set_appointment_outcome", {
        _appointment_id: meetingId,
        _outcome: outcome,
        _reason: reason ?? undefined,
        _notes: notes ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      for (const key of [
        "meetings-pending",
        "meetings-upcoming",
        "meetings-recent",
        "meeting-outcome-log",
        "source-funnel",
        "rep-meeting-stats",
      ]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

/** GHL users and whether each one has a dialer login yet. */
export interface GhlUserRow {
  ghl_user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  ghl_role: string | null;
  is_deleted: boolean;
  takes_meetings: boolean;
  needs_dialpad: boolean;
  provisioned_user_id: string | null;
}

export function useGhlUsers() {
  return useQuery({
    queryKey: ["ghl-users"],
    queryFn: async (): Promise<GhlUserRow[]> => {
      const { data, error } = await supabase
        .from("ghl_users")
        .select("*")
        .eq("is_deleted", false)
        .order("name");
      if (error) throw error;
      return (data ?? []) as GhlUserRow[];
    },
    staleTime: 60_000,
  });
}

export function useUpdateGhlUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ghlUserId,
      patch,
    }: {
      ghlUserId: string;
      patch: Partial<Pick<GhlUserRow, "needs_dialpad" | "takes_meetings">>;
    }) => {
      const { error } = await supabase.from("ghl_users").update(patch).eq("ghl_user_id", ghlUserId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ghl-users"] }),
  });
}
