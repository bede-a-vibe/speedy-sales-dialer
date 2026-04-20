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
    const methodLabel = method === "email" ? "Email" : method === "prospecting" ? "Prospecting" : "Call";

    // 1) Task — best-effort, fire and continue
    try {
      await ghlCreateTask(ghlContactId, {
        title: title ?? getFollowUpTaskTitle(method),
        body: description ?? "",
        dueDate: scheduledFor,
        completed: false,
        ...(ghlUserId ? { assignedTo: ghlUserId } : {}),
      });
    } catch (taskErr) {
      reportSyncFailure("create follow-up task", ghlContactId, taskErr);
    }

    // 2) Opportunity — best-effort, isolated so it never blocks the note
    let opportunity: unknown = null;
    const opportunityTarget = resolveGhlOpportunityTarget({
      pipelineType: "follow_up",
      pipelineId,
      pipelineStageId,
    });

    if (opportunityTarget.pipelineId && opportunityTarget.pipelineStageId) {
      try {
        const findExistingOpportunityId = async (scopeToPipeline: boolean): Promise<string | undefined> => {
          try {
            const searchResult = await ghlSearchOpportunities(
              scopeToPipeline ? opportunityTarget.pipelineId! : undefined,
              ghlContactId,
            );
            const existing = searchResult.opportunities?.find((opp) => opp.status === "open")
              ?? searchResult.opportunities?.[0];
            return existing?.id;
          } catch (searchErr) {
            console.warn("[GHL Sync] Failed to search opportunities:", searchErr);
            return undefined;
          }
        };

        let existingOpportunityId = await findExistingOpportunityId(true);
        const opportunityName = `${contactName ?? "Contact"} – Follow Up (${method ?? "call"}) ${new Date(scheduledFor).toLocaleDateString("en-AU")}`;

        const updatePayload = {
          pipelineId: opportunityTarget.pipelineId,
          pipelineStageId: opportunityTarget.pipelineStageId,
          name: opportunityName,
          status: "open",
        };

        if (existingOpportunityId) {
          opportunity = await ghlUpdateOpportunity(existingOpportunityId, updatePayload);
        } else {
          try {
            opportunity = await ghlCreateOpportunity({
              pipelineType: "follow_up",
              pipelineId: opportunityTarget.pipelineId,
              pipelineStageId: opportunityTarget.pipelineStageId,
              contactId: ghlContactId,
              name: opportunityName,
              status: "open",
            });
          } catch (createErr) {
            const message = createErr instanceof Error ? createErr.message : String(createErr);
            if (message.includes("duplicate opportunity")) {
              console.warn("[GHL Sync] Duplicate opportunity detected, searching across all pipelines:", message);
              // GHL blocks duplicate opps per CONTACT (across pipelines), so widen the search
              existingOpportunityId = await findExistingOpportunityId(false);
              if (existingOpportunityId) {
                opportunity = await ghlUpdateOpportunity(existingOpportunityId, updatePayload);
              } else {
                throw createErr;
              }
            } else {
              throw createErr;
            }
          }
        }

        await persistOpportunityIdentity({
          pipelineItemId,
          ghlPipelineId: opportunityTarget.pipelineId,
          ghlStageId: opportunityTarget.pipelineStageId,
          opportunityPayload: opportunity,
        });
      } catch (oppErr) {
        reportSyncFailure("sync follow-up opportunity", ghlContactId, oppErr);
      }
    }

    // 3) Note — always attempt, even if task/opportunity failed
    try {
      const noteParts = [`📋 Follow-Up Scheduled: ${new Date(scheduledFor).toLocaleString("en-AU")}`];
      noteParts.push(`Method: ${methodLabel}`);
      if (repName) noteParts.push(`Assigned to: ${repName}`);
      if (description) noteParts.push(`Notes: ${description}`);
      noteParts.push(`Logged via Speedy Sales Dialer`);
      await ghlAddNote(ghlContactId, noteParts.join("\n"));
    } catch (noteErr) {
      reportSyncFailure("push follow-up note", ghlContactId, noteErr);
    }

    // 4) Mirror — independent of GHL pushes
    try {
      await persistContactMirror({
        contactId,
        ghlContactId,
        status: "follow_up",
        scheduledFor,
        notes: description ?? null,
      });
    } catch (mirrorErr) {
      console.warn("[GHL Sync] Failed to persist contact mirror:", mirrorErr);
    }

    return true;
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
