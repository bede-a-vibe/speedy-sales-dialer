import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { failure, json, requireUser, unauthenticated } from "../result";

export default defineTool({
  name: "list_call_transcripts",
  title: "List my call transcripts",
  description:
    "List the signed-in rep's connected Dialpad calls that have a transcript, newest first, with business, talk time and outcome. Use `get_call_transcript` with the returned dialpad_call_id to read the full transcript. Page with `offset`.",
  inputSchema: {
    from: z.string().optional().describe("Earliest call date, YYYY-MM-DD."),
    to: z.string().optional().describe("Latest call date, YYYY-MM-DD."),
    min_talk_seconds: z.number().int().min(0).optional().describe("Only calls with at least this much talk time (default 60)."),
    limit: z.number().int().min(1).max(200).optional().describe("Default 50."),
    offset: z.number().int().min(0).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, min_talk_seconds, limit, offset }, ctx) => {
    const userId = requireUser(ctx);
    if (!userId) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    const lim = limit ?? 50;
    const off = offset ?? 0;
    let q = supabase
      .from("dialpad_calls")
      .select("dialpad_call_id, started_at, talk_time_seconds, external_number, direction, call_log_id, contacts(business_name), call_logs(outcome)", { count: "exact" })
      .eq("user_id", userId)
      .not("transcript", "is", null)
      .gte("talk_time_seconds", min_talk_seconds ?? 60)
      .order("started_at", { ascending: false })
      .range(off, off + lim - 1);
    if (from) q = q.gte("started_at", new Date(`${from}T00:00:00+10:00`).toISOString());
    if (to) q = q.lte("started_at", new Date(`${to}T23:59:59+10:00`).toISOString());
    const { data, error, count } = await q;
    if (error) return failure(error.message);
    return json({
      total: count ?? 0,
      offset: off,
      calls: (data ?? []).map((r: any) => ({
        dialpad_call_id: r.dialpad_call_id,
        started_at: r.started_at,
        talk_seconds: r.talk_time_seconds,
        business: r.contacts?.business_name ?? null,
        phone: r.external_number,
        direction: r.direction,
        outcome: r.call_logs?.outcome ?? null,
      })),
    });
  },
});
