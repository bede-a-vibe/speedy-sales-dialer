import { useCallback } from "react";
import {
  ghlAddNote,
  ghlAddTag,
  ghlCreateTask,
  ghlCreateOpportunity,
  ghlCreateAppointment,
  ghlUpdateContact,
} from "@/lib/ghl";

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
    const { ghlContactId, scheduledFor, title, description, method } = params;

    try {
      await ghlCreateTask(ghlContactId, {
        title: title ?? `Follow up (${method ?? "call"})`,
        body: description ?? "",
        dueDate: scheduledFor,
        completed: false,
      });
    } catch (err) {
      console.error("[GHL Sync] Failed to push follow-up task:", err);
    }
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

  return { pushCallNote, pushBooking, pushFollowUp, pushDNC };
}
