import type { SupabaseClient } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// The generated types don't carry these tables until Lovable next regenerates them.
const db = supabase as unknown as SupabaseClient;

/** A call attached to a Loom review: a dialer call, or a pasted recording link. */
export interface LoomReviewCall {
  id: string;
  callLogId: string | null;
  label: string | null;
  url: string | null;
  note: string | null;
  repUserId: string | null;
  business: string | null;
  outcome: string | null;
  calledAt: string | null;
  talk: number | null;
  dialpadCallId: string | null;
}

export interface LoomRecipient { userId: string; seenAt: string | null; watchedAt: string | null }

export interface LoomReview {
  id: string;
  title: string;
  loomUrl: string;
  duration: number | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  /** Everyone it went to for a manager; only the signed-in rep's own row for a rep (RLS). */
  recipients: LoomRecipient[];
  calls: LoomReviewCall[];
  lesson: { id: string; courseId: string; courseSlug: string | null; courseTitle: string | null; section: string } | null;
}

interface RawCallLog {
  id: string; user_id: string; created_at: string; outcome: string;
  dialpad_call_id: string | null; dialpad_talk_time_seconds: number | null;
  contacts: { business_name: string | null } | null;
}
interface RawReviewCall {
  id: string; call_log_id: string | null; label: string | null; url: string | null; note: string | null; sort: number;
  call_logs: RawCallLog | null;
}
interface RawLesson { id: string; course_id: string; section: string; lms_courses: { slug: string; title: string } | null }
interface RawReview {
  id: string; title: string; loom_url: string; duration_seconds: number | null; notes: string | null;
  created_by: string; created_at: string;
  loom_review_recipients: Array<{ user_id: string; seen_at: string | null; watched_at: string | null }> | null;
  loom_review_calls: RawReviewCall[] | null;
  lms_lessons: RawLesson[] | RawLesson | null;
}

const CALL_LOG_FIELDS = "id, user_id, created_at, outcome, dialpad_call_id, dialpad_talk_time_seconds, contacts(business_name)";
const REVIEW_FIELDS =
  "id, title, loom_url, duration_seconds, notes, created_by, created_at, " +
  "loom_review_recipients(user_id, seen_at, watched_at), " +
  `loom_review_calls(id, call_log_id, label, url, note, sort, call_logs(${CALL_LOG_FIELDS})), ` +
  "lms_lessons(id, course_id, section, lms_courses(slug, title))";

function fromCallLog(c: RawCallLog): Omit<LoomReviewCall, "id" | "label" | "url" | "note"> {
  return {
    callLogId: c.id, repUserId: c.user_id, business: c.contacts?.business_name ?? null, outcome: c.outcome,
    calledAt: c.created_at, talk: c.dialpad_talk_time_seconds, dialpadCallId: c.dialpad_call_id,
  };
}

function toReview(r: RawReview): LoomReview {
  const lesson = (Array.isArray(r.lms_lessons) ? r.lms_lessons[0] : r.lms_lessons) ?? null;
  return {
    id: r.id, title: r.title, loomUrl: r.loom_url, duration: r.duration_seconds, notes: r.notes,
    createdBy: r.created_by, createdAt: r.created_at,
    recipients: (r.loom_review_recipients ?? []).map((x) => ({ userId: x.user_id, seenAt: x.seen_at, watchedAt: x.watched_at })),
    calls: [...(r.loom_review_calls ?? [])].sort((a, b) => a.sort - b.sort).map((c) => ({
      id: c.id, label: c.label, url: c.url, note: c.note,
      ...(c.call_logs
        ? fromCallLog(c.call_logs)
        : { callLogId: c.call_log_id, repUserId: null, business: null, outcome: null, calledAt: null, talk: null, dialpadCallId: null }),
    })),
    lesson: lesson
      ? { id: lesson.id, courseId: lesson.course_id, section: lesson.section, courseSlug: lesson.lms_courses?.slug ?? null, courseTitle: lesson.lms_courses?.title ?? null }
      : null,
  };
}

/** Every Loom review, newest first. Managers only in practice (RLS). */
export function useLoomReviews() {
  return useQuery({
    queryKey: ["loom-reviews", "all"],
    staleTime: 30_000,
    queryFn: async (): Promise<LoomReview[]> => {
      const { data, error } = await db.from("loom_reviews").select(REVIEW_FIELDS).order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return ((data ?? []) as unknown as RawReview[]).map(toReview);
    },
  });
}

/** The Loom reviews sent to the signed-in person. */
export function useMyLoomReviews() {
  const { user } = useAuth();
  const userId = user?.id;
  return useQuery({
    queryKey: ["loom-reviews", "mine", userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<LoomReview[]> => {
      const { data: rows, error: rowsError } = await db.from("loom_review_recipients").select("review_id").eq("user_id", userId!);
      if (rowsError) throw rowsError;
      const ids = (rows ?? []).map((r) => r.review_id as string);
      if (ids.length === 0) return [];
      const { data, error } = await db.from("loom_reviews").select(REVIEW_FIELDS).in("id", ids).order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as RawReview[]).map(toReview);
    },
  });
}

/** The review behind a Classroom lesson, for its attached calls. */
export function useLoomReview(id: string | null | undefined) {
  return useQuery({
    queryKey: ["loom-reviews", "one", id],
    enabled: !!id,
    staleTime: 30_000,
    queryFn: async (): Promise<LoomReview | null> => {
      const { data, error } = await db.from("loom_reviews").select(REVIEW_FIELDS).eq("id", id!).maybeSingle();
      if (error) throw error;
      return data ? toReview(data as unknown as RawReview) : null;
    },
  });
}

/** How many Loom reviews the signed-in rep hasn't opened. Adds to the Training badge. */
export function useUnseenLoomCount() {
  const { user } = useAuth();
  const userId = user?.id;
  return useQuery({
    queryKey: ["unseen-loom-reviews", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const { count } = await db.from("loom_review_recipients").select("review_id", { count: "exact", head: true })
        .eq("user_id", userId!).is("seen_at", null);
      return count ?? 0;
    },
  });
}

/** Stamp the signed-in rep's own row: opened, or watched (and undo). */
export function useStampLoomReview() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (p: { reviewId: string; seen?: true; watched?: boolean }) => {
      const now = new Date().toISOString();
      const patch: Record<string, string | null> = {};
      if (p.seen) patch.seen_at = now;
      if (p.watched !== undefined) patch.watched_at = p.watched ? now : null;
      const { error } = await db.from("loom_review_recipients").update(patch).eq("review_id", p.reviewId).eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["loom-reviews"] });
      qc.invalidateQueries({ queryKey: ["unseen-loom-reviews"] });
    },
  });
}

export interface LoomReviewDraft {
  id: string | null;
  title: string;
  loomUrl: string;
  duration: number | null;
  notes: string;
  reps: string[];
  calls: Array<Pick<LoomReviewCall, "callLogId" | "label" | "url" | "note">>;
  courseId: string | null;
  section: string;
}

const invalidateAll = (qc: ReturnType<typeof useQueryClient>) => {
  for (const key of ["loom-reviews", "unseen-loom-reviews", "lms-lessons"]) qc.invalidateQueries({ queryKey: [key] });
};

export function useSaveLoomReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: LoomReviewDraft) => {
      const { error } = await db.rpc("save_loom_review", {
        _id: d.id, _title: d.title, _loom_url: d.loomUrl, _duration: d.duration, _notes: d.notes, _reps: d.reps,
        _calls: d.calls.map((c) => ({ call_log_id: c.callLogId, label: c.label, url: c.url, note: c.note })),
        _course: d.courseId, _section: d.section,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteLoomReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("loom_reviews").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

/**
 * Calls to attach: conversations of 30 seconds or more, newest first. With a
 * business name typed it searches the whole history; without one, the last 14 days.
 */
export function useCallPicker(search: string, repUserId: string | null, enabled: boolean) {
  const term = search.trim().replace(/[%_,()*\\]/g, " ").trim();
  return useQuery({
    queryKey: ["loom-call-picker", term, repUserId],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<LoomReviewCall[]> => {
      let q = db.from("call_logs")
        .select(CALL_LOG_FIELDS.replace("contacts(", "contacts!inner("))
        .not("dialpad_call_id", "is", null)
        .gte("dialpad_talk_time_seconds", 30)
        .order("created_at", { ascending: false })
        .limit(30);
      if (repUserId) q = q.eq("user_id", repUserId);
      if (term.length >= 2) q = q.ilike("contacts.business_name", `%${term}%`);
      else q = q.gte("created_at", new Date(Date.now() - 14 * 86_400_000).toISOString());
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as unknown as RawCallLog[]).map((c) => ({ id: c.id, label: null, url: null, note: null, ...fromCallLog(c) }));
    },
  });
}

/** One call by id, for "Add a Loom review" from the call review dialog. */
export async function fetchCallForReview(callLogId: string): Promise<LoomReviewCall | null> {
  const { data, error } = await db.from("call_logs").select(CALL_LOG_FIELDS).eq("id", callLogId).maybeSingle();
  if (error) throw error;
  return data ? { id: callLogId, label: null, url: null, note: null, ...fromCallLog(data as unknown as RawCallLog) } : null;
}

/** Transcript on demand: they are long, and most attached calls are listened to instead. */
export function useCallTranscript(callLogId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["loom-call-transcript", callLogId],
    enabled: enabled && !!callLogId,
    staleTime: 300_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await db.from("call_logs").select("dialpad_transcript").eq("id", callLogId!).maybeSingle();
      if (error) throw error;
      return (data?.dialpad_transcript as string | null) ?? null;
    },
  });
}
