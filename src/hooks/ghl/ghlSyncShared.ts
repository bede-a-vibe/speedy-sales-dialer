import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { extractGhlOpportunityId, extractGhlOpportunityTarget } from "@/lib/ghlOpportunityIdentity";

export type CallOutcome =
  | "no_answer"
  | "voicemail"
  | "not_interested"
  | "dnc"
  | "follow_up"
  | "booked"
  | "wrong_number";

export interface PushCallNoteParams {
  ghlContactId: string;
  outcome: CallOutcome;
  notes?: string;
  durationSeconds?: number;
  repName?: string;
}

export interface PushBookingParams {
  ghlContactId: string;
  contactId?: string;
  calendarId: string;
  scheduledFor: string;
  title?: string;
  notes?: string;
  pipelineItemId?: string;
  pipelineId?: string;
  pipelineStageId?: string;
  contactName?: string;
  repName?: string;
  ghlUserId?: string;
}

export interface PushFollowUpParams {
  ghlContactId: string;
  contactId?: string;
  scheduledFor: string;
  title?: string;
  description?: string;
  method?: "call" | "email" | "prospecting";
  contactName?: string;
  repName?: string;
  pipelineItemId?: string;
  pipelineId?: string;
  pipelineStageId?: string;
  ghlUserId?: string;
}

export interface PushFollowUpEmailDraftParams {
  ghlContactId: string;
  contactName: string;
  businessName: string;
  industry?: string;
  repName: string;
  callNotes?: string;
  callTranscriptSummary?: string;
  scheduledFor?: string;
}

export interface PushDNCParams {
  ghlContactId: string;
  contactId?: string;
}

export interface RefreshOpportunityMirrorParams {
  pipelineItemId: string;
  ghlOpportunityId: string;
}

export function describeError(err: unknown) {
  return err instanceof Error ? err.message : "Unknown error";
}

export function reportSyncFailure(action: string, ghlContactId: string, err: unknown) {
  const message = describeError(err);
  console.error(`[GHL Sync] Failed to ${action} for contact ${ghlContactId}:`, err);
  toast.error(`GHL sync failed: ${action}`, {
    description: `Contact ${ghlContactId}: ${message}`,
  });
}

export async function persistOpportunityIdentity(params: {
  pipelineItemId?: string;
  ghlPipelineId?: string;
  ghlStageId?: string;
  opportunityPayload?: unknown;
}) {
  if (!params.pipelineItemId) return;

  const extractedTarget = extractGhlOpportunityTarget(params.opportunityPayload);
  const ghlOpportunityId = extractedTarget.opportunityId ?? extractGhlOpportunityId(params.opportunityPayload);
  const updates: Partial<{ ghl_pipeline_id: string; ghl_stage_id: string; ghl_opportunity_id: string }> = {};

  const pipelineId = extractedTarget.pipelineId ?? params.ghlPipelineId;
  const stageId = extractedTarget.stageId ?? params.ghlStageId;

  if (pipelineId) updates.ghl_pipeline_id = pipelineId;
  if (stageId) updates.ghl_stage_id = stageId;
  if (ghlOpportunityId) updates.ghl_opportunity_id = ghlOpportunityId;

  if (Object.keys(updates).length === 0) return;

  const { error } = await supabase
    .from("pipeline_items")
    .update(updates)
    .eq("id", params.pipelineItemId);

  if (error) {
    console.warn("[GHL Sync] Failed to persist opportunity identity:", error);
  }
}

export async function persistContactMirror(params: {
  contactId?: string;
  ghlContactId: string;
  status?: string;
  scheduledFor?: string | null;
  notes?: string | null;
  clearMeetingBookedDate?: boolean;
  clearNextFollowUpDate?: boolean;
  clearFollowUpNote?: boolean;
  isDnc?: boolean;
}) {
  if (!params.contactId) return;

  const updates: {
    ghl_contact_id: string;
    updated_at: string;
    status?: string;
    is_dnc?: boolean;
    meeting_booked_date?: string | null;
    next_followup_date?: string | null;
    follow_up_note?: string | null;
  } = {
    ghl_contact_id: params.ghlContactId,
    updated_at: new Date().toISOString(),
  };

  if (params.status) updates.status = params.status;
  if (params.isDnc != null) updates.is_dnc = params.isDnc;

  if (params.clearMeetingBookedDate) {
    updates.meeting_booked_date = null;
  } else if (params.scheduledFor !== undefined) {
    updates.meeting_booked_date = params.scheduledFor;
  }

  if (params.clearNextFollowUpDate) {
    updates.next_followup_date = null;
  } else if (params.scheduledFor !== undefined) {
    updates.next_followup_date = params.scheduledFor;
  }

  if (params.clearFollowUpNote) {
    updates.follow_up_note = null;
  } else if (params.notes !== undefined) {
    updates.follow_up_note = params.notes;
  }

  const { error } = await supabase
    .from("contacts")
    .update(updates)
    .eq("id", params.contactId);

  if (error) {
    console.warn("[GHL Sync] Failed to persist contact mirror:", error);
  }
}
