import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { failure, json, requireUser, unauthenticated } from "../result";

export default defineTool({
  name: "list_follow_ups",
  title: "List my follow-ups and bookings",
  description:
    "List the signed-in rep's scheduled pipeline items (follow-ups and booked appointments) within a date window.",
  inputSchema: {
    days_ahead: z.number().int().min(0).max(90).optional().describe("How far forward to look, in days (default 7)."),
    days_back: z.number().int().min(0).max(90).optional().describe("How far back to include overdue items (default 7)."),
    pipeline_type: z
      .enum(["follow_up", "booked"])
      .optional()
      .describe("Restrict to one pipeline type. Omit for both."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ days_ahead, days_back, pipeline_type }, ctx) => {
    const userId = requireUser(ctx);
    if (!userId) return unauthenticated();
    const ahead = days_ahead ?? 7;
    const back = days_back ?? 7;
    const from = new Date(Date.now() - back * 86400000).toISOString();
    const to = new Date(Date.now() + ahead * 86400000).toISOString();

    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("pipeline_items")
      .select(
        "id, pipeline_type, status, scheduled_for, follow_up_method, notes, contact_id, contacts(business_name, contact_person, phone)",
      )
      .eq("assigned_user_id", userId)
      .gte("scheduled_for", from)
      .lte("scheduled_for", to)
      .order("scheduled_for", { ascending: true })
      .limit(100);
    if (pipeline_type) query = query.eq("pipeline_type", pipeline_type);

    const { data, error } = await query;
    if (error) return failure(error.message);
    return json({ count: data?.length ?? 0, items: data ?? [] });
  },
});