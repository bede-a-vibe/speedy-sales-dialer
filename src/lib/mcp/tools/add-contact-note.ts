import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { failure, json, requireUser, unauthenticated } from "../result";

export default defineTool({
  name: "add_contact_note",
  title: "Add a contact note",
  description: "Add a note to a contact's timeline in the dialer, authored by the signed-in user.",
  inputSchema: {
    contact_id: z.string().uuid().describe("The contact's UUID."),
    content: z.string().trim().min(1).max(4000).describe("The note text."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ contact_id, content }, ctx) => {
    const userId = requireUser(ctx);
    if (!userId) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("contact_notes")
      .insert({ contact_id, content, created_by: userId, source: "manual" })
      .select("id, contact_id, content, created_at")
      .maybeSingle();
    if (error) return failure(error.message);
    return json({ saved: true, note: data }, { note_id: data?.id });
  },
});