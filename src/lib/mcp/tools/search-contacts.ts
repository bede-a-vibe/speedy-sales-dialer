import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { failure, json, requireUser, unauthenticated } from "../result";

export default defineTool({
  name: "search_contacts",
  title: "Search contacts",
  description:
    "Search the dialer's contacts by business name, contact person or phone number. Returns matching contact records with their IDs.",
  inputSchema: {
    query: z.string().trim().min(2).describe("Business name, person name or phone number fragment."),
    limit: z.number().int().min(1).max(25).optional().describe("Maximum contacts to return (default 10)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!requireUser(ctx)) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    const like = `%${query.replace(/[%_]/g, "")}%`;
    const { data, error } = await supabase
      .from("contacts")
      .select("id, business_name, contact_person, phone, email, dm_name, dm_phone, city, status, lifecycle_stage")
      .eq("is_archived", false)
      .or(
        `business_name.ilike.${like},contact_person.ilike.${like},phone.ilike.${like},dm_name.ilike.${like},dm_phone.ilike.${like}`,
      )
      .limit(limit ?? 10);
    if (error) return failure(error.message);
    return json({ count: data?.length ?? 0, contacts: data ?? [] }, { contacts: data ?? [] });
  },
});