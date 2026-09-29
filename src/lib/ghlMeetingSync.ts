import { supabase } from "@/integrations/supabase/client";
import {
  ghlAddTag,
  ghlCreateOpportunity,
  ghlSearchOpportunities,
  ghlUpdateOpportunity,
} from "@/lib/ghl";
import { getAppointmentOutcomeLabel, getOutcomeReasonLabel, type AppointmentOutcomeValue } from "@/lib/appointments";
import { GHL_PIPELINE_CONTRACT } from "@/shared/ghlPipelineContract";

/** Live stage ids in GHL "Sales Pipeline" (read from the GHL API 29/09/2026). */
export const SALES_PIPELINE_STAGES = {
  contacted: "0b02d920-b119-4e69-9c6a-8b543aa612b0",
  discovery_complete: "7ce46a7e-f2d2-4fd1-b3f9-e8b72d7a9469",
  proposal_sent: "77a1aa21-6b29-40f2-96d4-ddadc13ac1a4",
  closed_won: "e4d4afb5-f6c1-487f-9d7b-37735922c3e0",
  closed_lost: "b6d9f3c4-faf7-4e6d-8f8c-48b05d98203c",
  long_term_nurture: "958c370c-f1c4-40fe-bc17-4e612c89b94e",
} as const;

type GhlStatus = "open" | "won" | "lost";
type StageTarget = { stageId: string; status: GhlStatus; tag: string };

/**
 * One GHL stage per dialer meeting result. GHL has no "No-show" or
 * "Cancelled" stage, so those are told apart by a contact tag.
 */
export const APPOINTMENT_OUTCOME_TO_GHL_STAGE: Record<AppointmentOutcomeValue | "booked", StageTarget> = {
  booked: { stageId: SALES_PIPELINE_STAGES.contacted, status: "open", tag: "meeting-booked" },
  rescheduled: { stageId: SALES_PIPELINE_STAGES.contacted, status: "open", tag: "meeting-rescheduled" },
  no_show: { stageId: SALES_PIPELINE_STAGES.contacted, status: "open", tag: "meeting-no-show" },
  cancelled: { stageId: SALES_PIPELINE_STAGES.closed_lost, status: "lost", tag: "meeting-cancelled" },
  showed_verbal_commitment: { stageId: SALES_PIPELINE_STAGES.proposal_sent, status: "open", tag: "meeting-verbal" },
  second_meeting_booked: { stageId: SALES_PIPELINE_STAGES.discovery_complete, status: "open", tag: "meeting-second-booked" },
  no_close_follow_up: { stageId: SALES_PIPELINE_STAGES.long_term_nurture, status: "open", tag: "meeting-no-close" },
  showed_closed: { stageId: SALES_PIPELINE_STAGES.closed_won, status: "won", tag: "meeting-closed-won" },
  showed_no_close: { stageId: SALES_PIPELINE_STAGES.closed_lost, status: "lost", tag: "meeting-no-close" },
  disqualified: { stageId: SALES_PIPELINE_STAGES.closed_lost, status: "lost", tag: "meeting-dq" },
};

/** Reverse lookup used by the inbound check: which stage ids are consistent with an outcome. */
export function stageMatchesOutcome(stageId: string | null | undefined, outcome: AppointmentOutcomeValue | null) {
  const target = APPOINTMENT_OUTCOME_TO_GHL_STAGE[outcome ?? "booked"];
  return !!stageId && stageId === target.stageId;
}

function extractOpportunityId(res: any): string | null {
  return res?.opportunity?.id ?? res?.data?.opportunity?.id ?? res?.id ?? res?.data?.id ?? null;
}

async function findOrCreateOpportunity(params: {
  ghlContactId: string;
  existingId: string | null;
  name: string;
  value?: number | null;
}): Promise<string | null> {
  if (params.existingId) return params.existingId;
  const pipelineId = GHL_PIPELINE_CONTRACT.booked.pipelineId;
  const search: any = await ghlSearchOpportunities(pipelineId, params.ghlContactId).catch(() => null);
  const list: any[] = search?.opportunities ?? search?.data?.opportunities ?? [];
  if (list.length) return list[0].id;
  const created = await ghlCreateOpportunity({
    pipelineType: "booked",
    pipelineId,
    pipelineStageId: GHL_PIPELINE_CONTRACT.booked.stageId,
    contactId: params.ghlContactId,
    name: params.name,
    status: "open",
    ...(params.value ? { monetaryValue: params.value } : {}),
  });
  return extractOpportunityId(created);
}

/**
 * Moves the meeting's GHL opportunity to the stage for its result, sets
 * won/lost/open and the lost reason, and tags the contact. Records success
 * or the error on the pipeline item so the board can show sync state.
 */
export async function syncMeetingOutcomeToGhl(params: {
  pipelineItemId: string;
  ghlContactId: string;
  ghlOpportunityId: string | null;
  businessName: string;
  outcome: AppointmentOutcomeValue | null;
  reason?: string | null;
  dealValue?: number | null;
}) {
  const target = APPOINTMENT_OUTCOME_TO_GHL_STAGE[params.outcome ?? "booked"];
  try {
    const oppId = await findOrCreateOpportunity({
      ghlContactId: params.ghlContactId,
      existingId: params.ghlOpportunityId,
      name: `${params.businessName} — Meeting`,
      value: params.dealValue,
    });
    if (!oppId) throw new Error("Could not find or create the GHL opportunity");

    const reasonLabel = getOutcomeReasonLabel(params.reason);
    await ghlUpdateOpportunity(oppId, {
      pipelineId: GHL_PIPELINE_CONTRACT.booked.pipelineId,
      pipelineStageId: target.stageId,
      status: target.status,
      ...(params.dealValue ? { monetaryValue: params.dealValue } : {}),
    });
    const tags = [target.tag];
    if (reasonLabel) tags.push(`reason: ${reasonLabel.toLowerCase()}`);
    await ghlAddTag(params.ghlContactId, tags).catch(() => {});

    await supabase
      .from("pipeline_items")
      .update({
        meeting_ghl_opportunity_id: oppId,
        meeting_ghl_stage_id: target.stageId,
        ghl_stage_synced_at: new Date().toISOString(),
        ghl_sync_error: null,
      } as any)
      .eq("id", params.pipelineItemId);
    return { ok: true as const, opportunityId: oppId, label: getAppointmentOutcomeLabel(params.outcome) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("pipeline_items")
      .update({ ghl_sync_error: message } as any)
      .eq("id", params.pipelineItemId);
    return { ok: false as const, error: message };
  }
}
