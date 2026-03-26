import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Find open follow-ups that are due
    const { data: dueFollowUps, error: fetchError } = await supabase
      .from("pipeline_items")
      .select("id, contact_id, notes")
      .eq("pipeline_type", "follow_up")
      .eq("status", "open")
      .eq("follow_up_method", "call")
      .lte("scheduled_for", new Date().toISOString());

    if (fetchError) throw fetchError;
    if (!dueFollowUps || dueFollowUps.length === 0) {
      return new Response(JSON.stringify({ requeued: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    let requeuedCount = 0;

    for (const item of dueFollowUps) {
      // Update contact: set status to uncalled, copy follow-up note
      const { error: contactError } = await supabase
        .from("contacts")
        .update({
          status: "uncalled",
          follow_up_note: item.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.contact_id);

      if (contactError) {
        console.error(`Failed to requeue contact ${item.contact_id}:`, contactError);
        continue;
      }

      // Mark pipeline item as completed
      const { error: pipelineError } = await supabase
        .from("pipeline_items")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);

      if (pipelineError) {
        console.error(`Failed to complete pipeline item ${item.id}:`, pipelineError);
        continue;
      }

      requeuedCount++;
    }

    console.log(`Requeued ${requeuedCount} follow-up leads`);

    return new Response(JSON.stringify({ requeued: requeuedCount }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("requeue-follow-ups error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
