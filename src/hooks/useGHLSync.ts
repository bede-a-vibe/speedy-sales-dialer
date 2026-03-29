import { useCallback } from "react";
import {
  ghlAddNote,
  ghlAddTag,
  ghlCreateTask,
  ghlCreateOpportunity,
  ghlCreateAppointment,
  ghlUpdateContact,
} from "@/lib/ghl";
import { generateFollowUpEmailDraft } from "@/lib/emailDraftGenerator";

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
  calendarId: string;
  scheduledFor: string; // ISO string
  title?: string;
  notes?: string;
  pipelineId?: string;
  pipelineStageId?: string;
  contactName?: string;
  repName?: string;
}

interface PushFollowUpParams {
  ghlContactId: string;
  scheduledFor: string; // ISO string
  title?: string;
  description?: string;
  method?: "call" | "email" | "prospecting";
  contactName?: string;
  repName?: string;
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
}

const OUTCOME_LABELS: Record<CallOutcome, string> = {
  no_answer: "No Answer",
  voicemail: "Voicemail",
  not_interested: "Not Interested",
  dnc: "DNC",
  follow_up: "Follow Up",
  booked: "Booked",
  wrong_number: "Wrong Number",
};

// Default to the "Outbound Prospecting" pipeline and "Connected - Follow Up Required" stage
const DEFAULT_FOLLOWUP_PIPELINE_ID = "QuBn7UX5zebPTd4fqW9x";
const DEFAULT_FOLLOWUP_STAGE_ID = "5102204c-7b00-48f9-94fb-70ca529841b9";

export function useGHLSync() {
  const pushCallNote = useCallback(async (params: PushCallNoteParams) => {
    const { ghlContactId, outcome, notes, durationSeconds, repName } = params;
    const parts = [`📞 Call Outcome: ${OUTCOME_LABELS[outcome]}`];
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
    } catch (err) {
      console.error("[GHL Sync] Failed to push call note:", err);
    }
  }, []);

  const pushBooking = useCallback(async (params: PushBookingParams) => {
    const {
      ghlContactId,
      calendarId,
      scheduledFor,
      title,
      notes,
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

      // If pipeline configured, create opportunity
      if (pipelineId && pipelineStageId) {
        await ghlCreateOpportunity({
          pipelineId,
          pipelineStageId,
          contactId: ghlContactId,
          name: `${contactName ?? "Contact"} – Booked ${new Date(scheduledFor).toLocaleDateString("en-AU")}`,
          status: "open",
        });
      }

      // Add a note about the booking
      const noteParts = [`📅 Appointment Booked: ${new Date(scheduledFor).toLocaleString("en-AU")}`];
      if (repName) noteParts.push(`Booked by: ${repName}`);
      if (notes) noteParts.push(`Notes: ${notes}`);
      await ghlAddNote(ghlContactId, noteParts.join("\n"));
    } catch (err) {
      console.error("[GHL Sync] Failed to push booking:", err);
    }
  }, []);

  const pushFollowUp = useCallback(async (params: PushFollowUpParams) => {
    const {
      ghlContactId,
      scheduledFor,
      title,
      description,
      method,
      contactName,
      repName,
      pipelineId,
      pipelineStageId,
    } = params;

    try {
      // Create a task as a reminder for the rep
      await ghlCreateTask(ghlContactId, {
        title: title ?? `Follow up (${method ?? "call"})`,
        body: description ?? "",
        dueDate: scheduledFor,
        completed: false,
      });

      // Also create an opportunity in the Outbound Prospecting pipeline
      const oppPipelineId = pipelineId || DEFAULT_FOLLOWUP_PIPELINE_ID;
      const oppStageId = pipelineStageId || DEFAULT_FOLLOWUP_STAGE_ID;

      await ghlCreateOpportunity({
        pipelineId: oppPipelineId,
        pipelineStageId: oppStageId,
        contactId: ghlContactId,
        name: `${contactName ?? "Contact"} – Follow Up (${method ?? "call"}) ${new Date(scheduledFor).toLocaleDateString("en-AU")}`,
        status: "open",
      });

      // Add a follow-up note
      const methodLabel = method === "email" ? "Email" : method === "prospecting" ? "Prospecting" : "Call";
      const noteParts = [`📋 Follow-Up Scheduled: ${new Date(scheduledFor).toLocaleString("en-AU")}`];
      noteParts.push(`Method: ${methodLabel}`);
      if (repName) noteParts.push(`Assigned to: ${repName}`);
      if (description) noteParts.push(`Notes: ${description}`);
      noteParts.push(`Logged via Speedy Sales Dialer`);
      await ghlAddNote(ghlContactId, noteParts.join("\n"));
    } catch (err) {
      console.error("[GHL Sync] Failed to push follow-up:", err);
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
      console.error("[GHL Sync] Failed to push follow-up email draft:", err);
    }
    return false;
  }, []);

  const pushDNC = useCallback(async (params: PushDNCParams) => {
    const { ghlContactId } = params;

    try {
      await ghlAddTag(ghlContactId, ["DNC"]);
      await ghlUpdateContact(ghlContactId, { dnd: true });
      await ghlAddNote(ghlContactId, "🚫 Marked as DNC via Speedy Sales Dialer");
    } catch (err) {
      console.error("[GHL Sync] Failed to push DNC:", err);
    }
  }, []);

  return { pushCallNote, pushBooking, pushFollowUp, pushFollowUpEmailDraft, pushDNC };
}
