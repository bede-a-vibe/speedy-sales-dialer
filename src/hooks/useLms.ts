import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * The classroom. Courses hold lessons; lessons hold a video, notes and
 * resources; reps tick lessons off. Managers author all of it in-app so
 * new trainings land here instead of being re-explained on the next call.
 */
export interface LmsCourse {
  id: string; slug: string; title: string; blurb: string | null; cover_url: string | null;
  industry: string | null; sort: number; published: boolean;
}
export interface LmsResource { label: string; url: string }
export interface LmsLesson {
  id: string; course_id: string; section: string; title: string; sort: number;
  video_url: string | null; body: string | null; resources: LmsResource[]; published: boolean;
  /** Key of a built-in panel to render as the lesson body (see COMPONENTS in Classroom). */
  component: string | null;
}

export function useLmsCourses() {
  return useQuery({
    queryKey: ["lms-courses"],
    staleTime: 60_000,
    queryFn: async (): Promise<LmsCourse[]> => {
      const { data, error } = await supabase.from("lms_courses").select("*").order("sort").order("title");
      if (error) throw error;
      return (data ?? []) as LmsCourse[];
    },
  });
}

/** All lessons for all courses in one read — it is small, and it lets the grid show progress per course. */
export function useLmsLessons() {
  return useQuery({
    queryKey: ["lms-lessons"],
    staleTime: 60_000,
    queryFn: async (): Promise<LmsLesson[]> => {
      const { data, error } = await supabase.from("lms_lessons").select("*").order("sort").order("created_at");
      if (error) throw error;
      return (data ?? []).map((l) => ({ ...l, resources: (Array.isArray(l.resources) ? l.resources : []) as unknown as LmsResource[] })) as LmsLesson[];
    },
  });
}

export function useMyLessonProgress() {
  return useQuery({
    queryKey: ["lms-progress", "me"],
    staleTime: 30_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return new Set();
      const { data, error } = await supabase.from("lms_lesson_progress").select("lesson_id").eq("user_id", auth.user.id);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.lesson_id));
    },
  });
}

/** Everyone's lesson ticks — managers only in practice (RLS). */
export function useTeamLessonProgress() {
  return useQuery({
    queryKey: ["lms-progress", "team"],
    staleTime: 30_000,
    queryFn: async (): Promise<Map<string, Set<string>>> => {
      const { data, error } = await supabase.from("lms_lesson_progress").select("user_id, lesson_id");
      if (error) throw error;
      const m = new Map<string, Set<string>>();
      for (const r of data ?? []) { const s = m.get(r.user_id) ?? new Set<string>(); s.add(r.lesson_id); m.set(r.user_id, s); }
      return m;
    },
  });
}

export function useSetLessonProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ lessonId, done }: { lessonId: string; done: boolean }) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      if (done) {
        const { error } = await supabase.from("lms_lesson_progress").upsert({ user_id: auth.user.id, lesson_id: lessonId }, { onConflict: "user_id,lesson_id" });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("lms_lesson_progress").delete().eq("user_id", auth.user.id).eq("lesson_id", lessonId);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lms-progress"] }),
  });
}

// ---------------- manager authoring ----------------

export function useUpsertCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: Partial<LmsCourse> & { title: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const slug = c.slug ?? c.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const { error } = await supabase.from("lms_courses").upsert(
        { ...(c.id ? { id: c.id } : {}), slug, title: c.title, blurb: c.blurb ?? null, cover_url: c.cover_url ?? null,
          industry: c.industry ?? null, sort: c.sort ?? 100, published: c.published ?? true,
          created_by: auth.user?.id ?? null, updated_at: new Date().toISOString() },
        { onConflict: c.id ? "id" : "slug" },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lms-courses"] }),
  });
}

export function useUpsertLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (l: Partial<LmsLesson> & { course_id: string; title: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("lms_lessons").upsert(
        { ...(l.id ? { id: l.id } : {}), course_id: l.course_id, section: l.section ?? "Lessons", title: l.title,
          sort: l.sort ?? 100, video_url: l.video_url ?? null, body: l.body ?? null, component: l.component ?? null,
          resources: (l.resources ?? []) as unknown as never, published: l.published ?? true,
          created_by: auth.user?.id ?? null, updated_at: new Date().toISOString() },
        { onConflict: "id" },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lms-lessons"] }),
  });
}

export function useDeleteLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lms_lessons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lms-lessons"] }),
  });
}

/** Turn a pasted YouTube / Loom / Vimeo link into an embeddable URL; direct video files come back as-is. */
export function toEmbedUrl(url: string | null | undefined): { kind: "iframe" | "video" | "link"; src: string } | null {
  if (!url) return null;
  const u = url.trim();
  const yt = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  if (yt) return { kind: "iframe", src: `https://www.youtube.com/embed/${yt[1]}` };
  const loom = u.match(/loom\.com\/(?:share|embed)\/([A-Za-z0-9]+)/);
  if (loom) return { kind: "iframe", src: `https://www.loom.com/embed/${loom[1]}` };
  const vimeo = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return { kind: "iframe", src: `https://player.vimeo.com/video/${vimeo[1]}` };
  if (/\.(mp4|webm|mov)(\?|$)/i.test(u)) return { kind: "video", src: u };
  return { kind: "link", src: u };
}
