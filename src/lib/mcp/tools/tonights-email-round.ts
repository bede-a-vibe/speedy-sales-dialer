import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { failure, json, requireUser, unauthenticated } from "../result";

export default defineTool({
  name: "tonights_email_round",
  title: "Tonight's email round",
  description:
    "List the leads the signed-in rep flagged in the dialer as 'Worth an email tonight' that are still unsent. Returns each lead's name, business, recipient email, phone, when it was flagged and the latest call notes. Unsent flags carry over from previous days, so this is the full outstanding email round.",
  inputSchema: {
    include_sent_today: z
      .boolean()
      .optional()
      .describe("Also include leads already marked sent today (default false)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ include_sent_today }, ctx) => {
    const userId = requireUser(ctx);
    if (!userId) return unauthenticated();

    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("contacts")
      .select(
        "id, business_name, contact_person, email, dm_email, phone, mobile, industry, state, key_quote, follow_up_note, agreed_next_steps, last_outcome, eod_email_flagged_at, eod_email_sent_at",
      )
      .eq("eod_email_flagged_by", userId)
      .not("eod_email_flagged_at", "is", null)
      .order("eod_email_flagged_at", { ascending: false })
      .limit(100);
    if (error) return failure(error.message);

    const rows = data ?? [];
    const unsent = rows.filter((r: any) => !r.eod_email_sent_at);

    let sentToday: any[] = [];
    if (include_sent_today) {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      sentToday = rows.filter(
        (r: any) => r.eod_email_sent_at && new Date(r.eod_email_sent_at) >= startOfToday,
      );
    }

    const mapRow = (r: any) => ({
      contact_id: r.id,
      business_name: r.business_name,
      contact_person: r.contact_person,
      recipient_email: r.email ?? r.dm_email ?? null,
      phone: r.phone ?? null,
      mobile: r.mobile ?? null,
      industry: r.industry ?? null,
      state: r.state ?? null,
      flagged_at: r.eod_email_flagged_at,
      last_outcome: r.last_outcome ?? null,
      key_quote: r.key_quote ?? null,
      follow_up_note: r.follow_up_note ?? null,
      agreed_next_steps: r.agreed_next_steps ?? null,
    });

    return json({
      unsent_count: unsent.length,
      unsent: unsent.map(mapRow),
      ...(include_sent_today ? { sent_today: sentToday.map(mapRow) } : {}),
    });
  },
});
