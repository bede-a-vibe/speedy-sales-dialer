import type { SupabaseClient } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { bucketFor, SHOWED_BUCKETS, type LibraryBucket } from "@/hooks/useCallLibrary";
import type { AppointmentOutcomeValue } from "@/lib/appointments";

// The generated types don't carry these tables until Lovable next regenerates them.
const db = supabase as unknown as SupabaseClient;

export interface StudySource { sourceUserId: string; repUserId: string }
export interface StudyNote { callLogId: string; userId: string; worked: string | null; useNext: string | null; updatedAt: string }

/** How the call ended, with a booked call split by what the meeting did. */
export type StudyResult = "closed" | "showed" | "booked" | "not_booked";

export interface StudyCall {
  id: string;
  calledAt: string;
  outcome: string;
  talk: number | null;
  dialpadCallId: string;
  business: string | null;
  result: StudyResult;
  /** How the booked meeting ended, where there was one. */
  bucket: LibraryBucket | null;
  meetingUrl: string | null;
}

const PAGE = 1000;

const BUCKET_RANK: LibraryBucket[] = ["closed", "verbal", "no_close", "second_meeting", "dq", "pending", "no_show", "cancelled"];

/** Best result among a lead's meetings: a close counts even if an earlier slot was a no-show. */
export function bestBucket(buckets: LibraryBucket[]): LibraryBucket | null {
  return BUCKET_RANK.find((b) => buckets.includes(b)) ?? null;
}

export function studyResult(outcome: string, bucket: LibraryBucket | null): StudyResult {
  if (outcome !== "booked") return "not_booked";
  if (bucket === "closed") return "closed";
  return bucket && SHOWED_BUCKETS.has(bucket) ? "showed" : "booked";
}

/** Whose calls the signed-in rep has been given. */
export function useMyStudySources() {
  const { user } = useAuth();
  const userId = user?.id;
  return useQuery({
    queryKey: ["call-study-sources", "mine", userId],
    enabled: !!userId,
    staleTime: 300_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await db.from("call_study_sources").select("source_user_id").eq("rep_user_id", userId!);
      if (error) throw error;
      return (data ?? []).map((r) => r.source_user_id as string);
    },
  });
}

/** Every source, for the manager's screen. */
export function useStudySources() {
  return useQuery({
    queryKey: ["call-study-sources", "all"],
    staleTime: 60_000,
    queryFn: async (): Promise<StudySource[]> => {
      const { data, error } = await db.from("call_study_sources").select("source_user_id, rep_user_id");
      if (error) throw error;
      return (data ?? []).map((r) => ({ sourceUserId: r.source_user_id as string, repUserId: r.rep_user_id as string }));
    },
  });
}

export function useSetStudySource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: StudySource & { on: boolean }) => {
      const { error } = p.on
        ? await db.from("call_study_sources").insert({ source_user_id: p.sourceUserId, rep_user_id: p.repUserId })
        : await db.from("call_study_sources").delete().eq("source_user_id", p.sourceUserId).eq("rep_user_id", p.repUserId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["call-study-sources"] }),
  });
}

interface RawLog {
  id: string; contact_id: string | null; created_at: string; outcome: string;
  dialpad_call_id: string; dialpad_talk_time_seconds: number | null; contacts: { business_name: string | null } | null;
}
interface RawItem {
  id: string; contact_id: string; scheduled_for: string | null; status: string;
  appointment_outcome: AppointmentOutcomeValue | null; recording_url: string | null;
}

/**
 * Every recorded call these people made that is worth hearing: booked, or a
 * conversation of a minute or more. The same bar as a rep's own reviews, over
 * the whole history instead of a fortnight. Read in pages because PostgREST
 * caps a select at 1,000 rows.
 */
export function useStudyCalls(sources: string[]) {
  const key = [...sources].sort().join(",");
  return useQuery({
    queryKey: ["call-study-calls", key],
    enabled: sources.length > 0,
    staleTime: 300_000,
    queryFn: async (): Promise<StudyCall[]> => {
      const logs: RawLog[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await db.from("call_logs")
          .select("id, contact_id, created_at, outcome, dialpad_call_id, dialpad_talk_time_seconds, contacts(business_name)")
          .in("user_id", sources)
          .not("dialpad_call_id", "is", null)
          .gt("dialpad_talk_time_seconds", 0)
          .or("outcome.eq.booked,dialpad_talk_time_seconds.gte.60")
          .order("created_at", { ascending: false }).order("id")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        logs.push(...((data ?? []) as unknown as RawLog[]));
        if ((data ?? []).length < PAGE) break;
      }

      const contactIds = [...new Set(logs.filter((l) => l.outcome === "booked").map((l) => l.contact_id).filter((x): x is string => !!x))];
      const items: RawItem[] = [];
      const fathom = new Map<string, string>();
      // Ids go in the URL, so ask in batches.
      for (let i = 0; i < contactIds.length; i += 80) {
        const { data, error } = await db.from("pipeline_items")
          .select("id, contact_id, scheduled_for, status, appointment_outcome, recording_url")
          .eq("pipeline_type", "booked").in("contact_id", contactIds.slice(i, i + 80));
        if (error) throw error;
        items.push(...((data ?? []) as unknown as RawItem[]));
      }
      for (let i = 0; i < items.length; i += 80) {
        const { data, error } = await db.from("fathom_meetings").select("pipeline_item_id, share_url")
          .in("pipeline_item_id", items.slice(i, i + 80).map((x) => x.id));
        // Only loses the meeting link.
        if (!error) for (const f of data ?? []) if (f.share_url) fathom.set(f.pipeline_item_id as string, f.share_url as string);
      }
      const byContact = new Map<string, RawItem[]>();
      for (const it of items) byContact.set(it.contact_id, [...(byContact.get(it.contact_id) ?? []), it]);

      return logs.map((l) => {
        const meetings = l.outcome === "booked" && l.contact_id
          // A meeting before this call can't be the one it booked.
          ? (byContact.get(l.contact_id) ?? []).filter((m) => m.scheduled_for && m.scheduled_for >= l.created_at)
          : [];
        const bucket = bestBucket(meetings.map((m) => bucketFor(m.appointment_outcome, m.status, m.scheduled_for)));
        const recorded = meetings.find((m) => fathom.has(m.id) || m.recording_url);
        return {
          id: l.id, calledAt: l.created_at, outcome: l.outcome, talk: l.dialpad_talk_time_seconds,
          dialpadCallId: l.dialpad_call_id, business: l.contacts?.business_name ?? null,
          bucket, result: studyResult(l.outcome, bucket),
          meetingUrl: recorded ? fathom.get(recorded.id) ?? recorded.recording_url : null,
        };
      });
    },
  });
}

interface RawNote { call_log_id: string; user_id: string; worked: string | null; use_next: string | null; updated_at: string }
const toNote = (r: RawNote): StudyNote => ({ callLogId: r.call_log_id, userId: r.user_id, worked: r.worked, useNext: r.use_next, updatedAt: r.updated_at });

/** The signed-in rep's own write-ups, by call. */
export function useMyStudyNotes() {
  const { user } = useAuth();
  const userId = user?.id;
  return useQuery({
    queryKey: ["call-study-notes", "mine", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, StudyNote>> => {
      const { data, error } = await db.from("call_study_notes").select("call_log_id, user_id, worked, use_next, updated_at").eq("user_id", userId!);
      if (error) throw error;
      return new Map(((data ?? []) as unknown as RawNote[]).map((r) => [r.call_log_id, toNote(r)] as const));
    },
  });
}

export function useSaveStudyNote() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (p: { callLogId: string; worked: string; useNext: string }) => {
      const { error } = await db.from("call_study_notes").upsert(
        { call_log_id: p.callLogId, user_id: user!.id, worked: p.worked.trim() || null, use_next: p.useNext.trim() || null, updated_at: new Date().toISOString() },
        { onConflict: "call_log_id,user_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["call-study-notes"] }),
  });
}

export interface TeamStudyNote extends StudyNote { business: string | null; callerId: string | null; calledAt: string | null; dialpadCallId: string | null }

/** What reps wrote on the calls they were given, newest first. Managers only in practice (RLS). */
export function useTeamStudyNotes() {
  return useQuery({
    queryKey: ["call-study-notes", "team"],
    staleTime: 60_000,
    queryFn: async (): Promise<TeamStudyNote[]> => {
      const { data, error } = await db.from("call_study_notes")
        .select("call_log_id, user_id, worked, use_next, updated_at, call_logs(user_id, created_at, dialpad_call_id, contacts(business_name))")
        .order("updated_at", { ascending: false }).limit(200);
      if (error) throw error;
      type Row = RawNote & { call_logs: { user_id: string; created_at: string; dialpad_call_id: string | null; contacts: { business_name: string | null } | null } | null };
      return ((data ?? []) as unknown as Row[]).map((r) => ({
        ...toNote(r), business: r.call_logs?.contacts?.business_name ?? null, callerId: r.call_logs?.user_id ?? null,
        calledAt: r.call_logs?.created_at ?? null, dialpadCallId: r.call_logs?.dialpad_call_id ?? null,
      }));
    },
  });
}
