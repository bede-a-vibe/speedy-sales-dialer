import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { failure, json, requireUser, unauthenticated } from "../result";

export default defineTool({
  name: "get_call_transcript",
  title: "Get a call transcript",
  description: "Read the full transcript (and Dialpad's summary) of one of the signed-in rep's calls, by dialpad_call_id from `list_call_transcripts`.",
  inputSchema: {
    dialpad_call_id: z.string().min(1).describe("The dialpad_call_id from list_call_transcripts."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ dialpad_call_id }, ctx) => {
    const userId = requireUser(ctx);
    if (!userId) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("dialpad_calls")
      .select("dialpad_call_id, started_at, talk_time_seconds, external_number, transcript, dialpad_summary, contacts(business_name, industry), call_logs(outcome, notes)")
      .eq("user_id", userId)
      .eq("dialpad_call_id", dialpad_call_id)
      .maybeSingle();
    if (error) return failure(error.message);
    if (!data) return failure("No call with that ID for your account.");
    const r = data as any;
    return json({
      dialpad_call_id: r.dialpad_call_id,
      started_at: r.started_at,
      talk_seconds: r.talk_time_seconds,
      business: r.contacts?.business_name ?? null,
      industry: r.contacts?.industry ?? null,
      phone: r.external_number,
      outcome: r.call_logs?.outcome ?? null,
      rep_notes: r.call_logs?.notes ?? null,
      dialpad_summary: r.dialpad_summary,
      transcript: r.transcript,
    });
  },
});
