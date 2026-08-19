import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { failure, json, requireUser, unauthenticated } from "../result";

export default defineTool({
  name: "my_call_activity",
  title: "My call activity",
  description:
    "Summarise the signed-in rep's own call activity over the last N days: total dials, a breakdown by outcome, and total talk time.",
  inputSchema: {
    days: z.number().int().min(1).max(90).optional().describe("Look-back window in days (default 7)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ days }, ctx) => {
    const userId = requireUser(ctx);
    if (!userId) return unauthenticated();
    const window = days ?? 7;
    const since = new Date(Date.now() - window * 24 * 60 * 60 * 1000).toISOString();

    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("call_logs")
      .select("outcome, created_at, dialpad_talk_time_seconds")
      .eq("user_id", userId)
      .gte("created_at", since)
      .limit(5000);
    if (error) return failure(error.message);

    const rows = data ?? [];
    const byOutcome: Record<string, number> = {};
    let talkSeconds = 0;
    for (const row of rows) {
      byOutcome[row.outcome] = (byOutcome[row.outcome] ?? 0) + 1;
      talkSeconds += row.dialpad_talk_time_seconds ?? 0;
    }

    return json({
      window_days: window,
      total_dials: rows.length,
      by_outcome: byOutcome,
      total_talk_minutes: Math.round(talkSeconds / 60),
    });
  },
});