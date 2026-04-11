import { useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  ghlAddNote,
  ghlAddTag,
  ghlCreateTask,
  ghlCreateOpportunity,
  ghlCreateAppointment,
  ghlGetOpportunity,
  ghlUpdateContact,
} from "@/lib/ghl";
import { extractGhlOpportunityId, extractGhlOpportunityTarget } from "@/lib/ghlOpportunityIdentity";
import { generateFollowUpEmailDraft } from "@/lib/emailDraftGenerator";
import { CALL_OUTCOME_LABELS, getFollowUpTaskTitle, resolveGhlOpportunityTarget } from "@/lib/pipelineMappings";

type CallOutcome =
  | "no_answer"
  | "voicemail"
  | "not_interested"
  | "dnc"
  | "follow_up"
  | "booked"
  | "wrong_number";

interface PushCallNoteParams {
  ghlContactId: string;
  outcome: CallOutcome;
  notes?: string;
  durationSeconds?: number;
  repName?: string;
}

interface PushBookingParams {
  ghlContactId: string;
  contactId?: string;
  calendarId: string;
  scheduledFor: string; // ISO string
  title?: string;
  notes?: string;
  pipelineItemId?: string;
  pipelineId?: string;
  pipelineStageId?: string;
  contactName?: string;
  repName?: string;
}

interface PushFollowUpParams {
  ghlContactId: string;
  contactId?: string;
  scheduledFor: string; // ISO string
  title?: string;
  description?: string;
  method?: "call" | "email" | "prospecting";
  contactName?: string;
  repName?: string;
  pipelineItemId?: string;
  pipelineId?: string;
  pipelineStageId?: string;
}

interface PushFollowUpEmailDraftParams {
  ghlContactId: string;
  contactName: string;
  businessName: string;
  industry?: string;
  repName: string;
  callNotes?: string;
  callTranscriptSummary?: string;
  scheduledFor?: string;
}

interface PushDNCParams {
  ghlContactId: string;
  contactId?: string;
}

interface RefreshOpportunityMirrorParams {
  pipelineItemId: string;
  ghlOpportunityId: string;
}

function describeError(err: unknown) {
  return err instanceof Error ? err.message : "Unknown error";
}

function reportSyncFailure(action: string, ghlContactId: string, err: unknown) {
  const message = describeError(err);
  console.error(`[GHL Sync] Failed to ${action} for contact ${ghlContactId}:`, err);
  toast.error(`GHL sync failed: ${action}`, {
    description: `Contact ${ghlContactId}: ${message}`,
  });
}

async function persistOpportunityIdentity(params: {
  pipelineItemId?: string;
  ghlPipelineId?: string;
  ghlStageId?: string;
  opportunityPayload?: unknown;
}) {
  if (!params.pipelineItemId) return;

  const extractedTarget = extractGhlOpportunityTarget(params.opportunityPayload);
  const ghlOpportunityId = extractedTarget.opportunityId ?? extractGhlOpportunityId(params.opportunityPayload);
  const updates: Record<string, string> = {};

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

async function persistContactMirror(params: {
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

  const updates: Record<string, string | boolean | null> = {
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

export function useGHLSync() {
  const pushCallNote = useCallback(async (params: PushCallNoteParams) => {
    const { ghlContactId, outcome, notes, durationSeconds, repName } = params;
    const parts = [`📞 Call Outcome: ${CALL_OUTCOME_LABELS[outcome]}`];
    if (repName) parts.push(`Rep: ${repName}`);
    if (durationSeconds != null) {
      const mins = Math.floor(durationSeconds / 60);
      const secs = durationSeconds % 60;
      parts.push(`Duration: ${mins}m ${secs}s`);
    }
    if (notes) parts.push(`Notes: ${notes}`);
    parts.push(`Logged via Speedy Sales Dialer at ${new Date().toLocaleString("en-AU")}`);

    try {
      await ghlAddNote(ghlContactId, parts.join("\n"));
      return true;
    } catch (err) {
      reportSyncFailure("push call note", ghlContactId, err);
      return false;
    }
  }, []);

  const pushBooking = useCallback(async (params: PushBookingParams) => {
    const {
      ghlContactId,
      contactId,
      calendarId,
      scheduledFor,
      title,
      notes,
      pipelineItemId,
      pipelineId,
      pipelineStageId,
      contactName,
      repName,
    } = params;

    try {
      // Create calendar appointment
      await ghlCreateAppointment({
        calendarId,
        contactId: ghlContactId,
        startTime: scheduledFor,
        title: title ?? "Appointment booked via Dialer",
        notes: notes ?? "",
      });

      const opportunityTarget = resolveGhlOpportunityTarget({
        pipelineType: "booked",
        pipelineId,
        pipelineStageId,
      });

      if (opportunityTarget.pipelineId && opportunityTarget.pipelineStageId) {
        const opportunity = await ghlCreateOpportunity({
          pipelineType: "booked",
          pipelineId: opportunityTarget.pipelineId,
          pipelineStageId: opportunityTarget.pipelineStageId,
          contactId: ghlContactId,
          name: `${contactName ?? "Contact"} – Booked ${new Date(scheduledFor).toLocaleDateString("en-AU")}`,
          status: "open",
        });

        await persistOpportunityIdentity({
          pipelineItemId,
          ghlPipelineId: opportunityTarget.pipelineId,
          ghlStageId: opportunityTarget.pipelineStageId,
          opportunityPayload: opportunity,
        });
      }

      // Add a note about the booking
      const noteParts = [`📅 Appointment Booked: ${new Date(scheduledFor).toLocaleString("en-AU")}`];
      if (repName) noteParts.push(`Booked by: ${repName}`);
      if (notes) noteParts.push(`Notes: ${notes}`);
      await ghlAddNote(ghlContactId, noteParts.join("\n"));

      await persistContactMirror({
        contactId,
        ghlContactId,
        status: "booked",
        scheduledFor,
        notes: null,
        clearNextFollowUpDate: true,
        clearFollowUpNote: true,
      });
      return true;
    } catch (err) {
      reportSyncFailure("push booking", ghlContactId, err);
      return false;
    }
  }, []);

  const pushFollowUp = useCallback(async (params: PushFollowUpParams) => {
    const {
      ghlContactId,
      contactId,
      scheduledFor,
      title,
      description,
      method,
      contactName,
      repName,
      pipelineItemId,
      pipelineId,
      pipelineStageId,
    } = params;

    try {
      // Create a task as a reminder for the rep
      await ghlCreateTask(ghlContactId, {
        title: title ?? getFollowUpTaskTitle(method),
        body: description ?? "",
        dueDate: scheduledFor,
        completed: false,
      });

      const opportunityTarget = resolveGhlOpportunityTarget({
        pipelineType: "follow_up",
        pipelineId,
        pipelineStageId,
      });

      const opportunity = await ghlCreateOpportunity({
        pipelineType: "follow_up",
        pipelineId: opportunityTarget.pipelineId,
        pipelineStageId: opportunityTarget.pipelineStageId,
        contactId: ghlContactId,
        name: `${contactName ?? "Contact"} – Follow Up (${method ?? "call"}) ${new Date(scheduledFor).toLocaleDateString("en-AU")}`,
        status: "open",
      });

      await persistOpportunityIdentity({
        pipelineItemId,
        ghlPipelineId: opportunityTarget.pipelineId,
        ghlStageId: opportunityTarget.pipelineStageId,
        opportunityPayload: opportunity,
      });

      // Add a follow-up note
      const methodLabel = method === "email" ? "Email" : method === "prospecting" ? "Prospecting" : "Call";
      const noteParts = [`📋 Follow-Up Scheduled: ${new Date(scheduledFor).toLocaleString("en-AU")}`];
      noteParts.push(`Method: ${methodLabel}`);
      if (repName) noteParts.push(`Assigned to: ${repName}`);
      if (description) noteParts.push(`Notes: ${description}`);
      noteParts.push(`Logged via Speedy Sales Dialer`);
      await ghlAddNote(ghlContactId, noteParts.join("\n"));

      await persistContactMirror({
        contactId,
        ghlContactId,
        status: "follow_up",
        scheduledFor,
        notes: description ?? null,
      });
      return true;
    } catch (err) {
      reportSyncFailure("push follow-up", ghlContactId, err);
      return false;
    }
  }, []);

  const pushFollowUpEmailDraft = useCallback(async (params: PushFollowUpEmailDraftParams) => {
    const {
      ghlContactId,
      contactName,
      businessName,
      industry,
      repName,
      callNotes,
      callTranscriptSummary,
      scheduledFor,
    } = params;

    try {
      const emailDraft = await generateFollowUpEmailDraft({
        contactName,
        businessName,
        industry,
        repName,
        callNotes,
        callTranscriptSummary,
        scheduledFor,
      });

      if (emailDraft) {
        const noteBody = [
          "✉️ DRAFT FOLLOW-UP EMAIL — Ready for Review",
          `Generated: ${new Date().toLocaleString("en-AU")}`,
          `Rep: ${repName}`,
          "",
          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
          "",
          `Subject: ${emailDraft.subject}`,
          "",
          emailDraft.body,
          "",
          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
          "⚠️ Review and personalise before sending.",
        ].join("\n");

        await ghlAddNote(ghlContactId, noteBody);
        console.log(`[GHL Sync] Follow-up email draft pushed to contact ${ghlContactId}`);
        return true;
      }
    } catch (err) {
      reportSyncFailure("push follow-up email draft", ghlContactId, err);
    }
    return false;
  }, []);

  const pushDNC = useCallback(async (params: PushDNCParams) => {
    const { ghlContactId, contactId } = params;

    try {
      await ghlAddTag(ghlContactId, ["DNC"]);
      await ghlUpdateContact(ghlContactId, { dnd: true });
      await ghlAddNote(ghlContactId, "🚫 Marked as DNC via Speedy Sales Dialer");
      await persistContactMirror({
        contactId,
        ghlContactId,
        status: "dnc",
        isDnc: true,
        clearMeetingBookedDate: true,
        clearNextFollowUpDate: true,
        clearFollowUpNote: true,
      });
    } catch (err) {
      reportSyncFailure("push DNC", ghlContactId, err);
    }
  }, []);

  const refreshOpportunityMirror = useCallback(async (params: RefreshOpportunityMirrorParams) => {
    try {
      const opportunity = await ghlGetOpportunity(params.ghlOpportunityId);
      const target = extractGhlOpportunityTarget(opportunity);

      await persistOpportunityIdentity({
        pipelineItemId: params.pipelineItemId,
        ghlPipelineId: target.pipelineId ?? undefined,
        ghlStageId: target.stageId ?? undefined,
        opportunityPayload: opportunity,
      });

      return target;
    } catch (err) {
      console.warn(`[GHL Sync] Failed to refresh opportunity ${params.ghlOpportunityId}:`, err);
      return null;
    }
  }, []);

  return { pushCallNote, pushBooking, pushFollowUp, pushFollowUpEmailDraft, pushDNC, refreshOpportunityMirror };
}
