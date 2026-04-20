import { useCallback } from "react";
import {
  ghlAddNote,
  ghlCreateOpportunity,
  ghlCreateTask,
  ghlSearchOpportunities,
  ghlUpdateOpportunity,
} from "@/lib/ghl";
import { generateFollowUpEmailDraft } from "@/lib/emailDraftGenerator";
import { getFollowUpTaskTitle, resolveGhlOpportunityTarget } from "@/lib/pipelineMappings";
import {
  persistContactMirror,
  persistOpportunityIdentity,
  reportSyncFailure,
  type PushFollowUpEmailDraftParams,
  type PushFollowUpParams,
} from "./ghlSyncShared";

export function useGHLFollowUpSync() {
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

    const { ghlUserId } = params;

    try {
      await ghlCreateTask(ghlContactId, {
        title: title ?? getFollowUpTaskTitle(method),
        body: description ?? "",
        dueDate: scheduledFor,
        completed: false,
        ...(ghlUserId ? { assignedTo: ghlUserId } : {}),
      });

      const opportunityTarget = resolveGhlOpportunityTarget({
        pipelineType: "follow_up",
        pipelineId,
        pipelineStageId,
      });

      let opportunity: unknown = null;

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

        const opportunityName = `${contactName ?? "Contact"} – Follow Up (${method ?? "call"}) ${new Date(scheduledFor).toLocaleDateString("en-AU")}`;

        if (existingOpportunityId) {
          opportunity = await ghlUpdateOpportunity(existingOpportunityId, {
            pipelineId: opportunityTarget.pipelineId,
            pipelineStageId: opportunityTarget.pipelineStageId,
            name: opportunityName,
            status: "open",
          });
        } else {
          opportunity = await ghlCreateOpportunity({
            pipelineType: "follow_up",
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

  return { pushFollowUp, pushFollowUpEmailDraft };
}
