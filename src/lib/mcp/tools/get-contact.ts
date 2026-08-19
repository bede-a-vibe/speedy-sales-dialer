import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { failure, json, requireUser, unauthenticated } from "../result";

export default defineTool({
  name: "get_contact",
  title: "Get contact detail",
  description:
    "Fetch one contact's full record plus its most recent call logs and notes. Use search_contacts first to find the contact ID.",
  inputSchema: {
    contact_id: z.string().uuid().describe("The contact's UUID."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ contact_id }, ctx) => {
    if (!requireUser(ctx)) return unauthenticated();
    const supabase = supabaseForUser(ctx);

    const { data: contact, error } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", contact_id)
      .maybeSingle();
    if (error) return failure(error.message);
    if (!contact) return failure("No contact found with that ID (or you do not have access to it).");

    const [{ data: calls }, { data: notes }] = await Promise.all([
      supabase
        .from("call_logs")
        .select("id, outcome, notes, created_at, dialpad_talk_time_seconds, follow_up_date")
        .eq("contact_id", contact_id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("contact_notes")
        .select("id, content, source, created_at")
        .eq("contact_id", contact_id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    return json(
      { contact, recent_calls: calls ?? [], recent_notes: notes ?? [] },
      { contact_id },
    );
  },
});