import { useCallback } from "react";
import {
  ghlAddNote,
  ghlCreateAppointment,
  ghlCreateOpportunity,
  ghlSearchOpportunities,
  ghlUpdateOpportunity,
} from "@/lib/ghl";
import { resolveGhlOpportunityTarget } from "@/lib/pipelineMappings";
import {
  persistContactMirror,
  persistOpportunityIdentity,
  reportSyncFailure,
  type PushBookingParams,
} from "./ghlSyncShared";

export function useGHLBookingSync() {
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
      await ghlCreateAppointment({
        calendarId,
        contactId: ghlContactId,
        startTime: scheduledFor,
        title: title ?? "Appointment booked via Dialer",
        notes: notes ?? "",
        ...(params.ghlUserId ? { assignedUserId: params.ghlUserId } : {}),
      });

      const opportunityTarget = resolveGhlOpportunityTarget({
        pipelineType: "booked",
        pipelineId,
        pipelineStageId,
      });

      if (opportunityTarget.pipelineId && opportunityTarget.pipelineStageId) {
        let existingOpportunityId: string | undefined;
        try {
          const searchResult = await ghlSearchOpportunities(opportunityTarget.pipelineId, ghlContactId);
          const existing = searchResult.opportunities?.find(
            (opp) => opp.status === "open",
          ) ?? searchResult.opportunities?.[0];
          existingOpportunityId = existing?.id;
        } catch (searchErr) {
          console.warn("[GHL Sync] Failed to search opportunities, will attempt create:", searchErr);
        }

        const opportunityName = `${contactName ?? "Contact"} – Booked ${new Date(scheduledFor).toLocaleDateString("en-AU")}`;
        let opportunity: unknown;

        if (existingOpportunityId) {
          opportunity = await ghlUpdateOpportunity(existingOpportunityId, {
            pipelineId: opportunityTarget.pipelineId,
            pipelineStageId: opportunityTarget.pipelineStageId,
            name: opportunityName,
            status: "open",
          });
        } else {
          opportunity = await ghlCreateOpportunity({
            pipelineType: "booked",
            pipelineId: opportunityTarget.pipelineId,
            pipelineStageId: opportunityTarget.pipelineStageId,
            contactId: ghlContactId,
            name: opportunityName,
            status: "open",
          });
        }

        await persistOpportunityIdentity({
          pipelineItemId,
          ghlPipelineId: opportunityTarget.pipelineId,
          ghlStageId: opportunityTarget.pipelineStageId,
          opportunityPayload: opportunity,
        });
      }

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

  return { pushBooking };
}
