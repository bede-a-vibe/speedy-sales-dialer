import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Recording links for the sales meetings of anyone whose calls this rep studies,
 * by pipeline item. fathom_meetings itself only returns a rep's own meetings.
 * A failure only loses links, so it returns none rather than throwing.
 */
export async function fetchStudyMeetingLinks(): Promise<Map<string, string>> {
  const { data, error } = await (supabase as unknown as SupabaseClient).rpc("get_study_meeting_links");
  if (error) return new Map();
  return new Map(((data ?? []) as Array<{ pipeline_item_id: string; share_url: string }>).map((r) => [r.pipeline_item_id, r.share_url]));
}
