import { useCallback } from "react";
import {
  ghlCreateOpportunity,
  ghlGetOpportunity,
  ghlSearchOpportunities,
  ghlUpdateOpportunity,
} from "@/lib/ghl";
import { extractGhlOpportunityTarget } from "@/lib/ghlOpportunityIdentity";
import { CALL_OUTCOME_LABELS } from "@/lib/pipelineMappings";
import { CALL_OUTCOME_TO_STAGE, OUTBOUND_PIPELINE_ID, type CallOutcomeForStage } from "@/shared/ghlPipelineContract";
import {
  persistOpportunityIdentity,
  reportSyncFailure,
  type RefreshOpportunityMirrorParams,
} from "./ghlSyncShared";

export function useGHLOpportunityMirror() {
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

  /**
   * Find or create an opportunity in the Outbound Prospecting pipeline,
   * then move it to the stage matching the call outcome.
   */
  const updateOpportunityStage = useCallback(async (params: {
    ghlContactId: string;
    outcome: CallOutcomeForStage;
    contactName?: string;
  }) => {
    const { ghlContactId, outcome, contactName } = params;
    const targetStageId = CALL_OUTCOME_TO_STAGE[outcome];
    if (!targetStageId) return;

    try {
      const searchResult = await ghlSearchOpportunities(OUTBOUND_PIPELINE_ID, ghlContactId);
      const existing = searchResult.opportunities?.find(
        (opp) => opp.status === "open" || opp.status === "won",
      ) ?? searchResult.opportunities?.[0];

      if (existing) {
        await ghlUpdateOpportunity(existing.id, {
          pipelineId: OUTBOUND_PIPELINE_ID,
          pipelineStageId: targetStageId,
        });
        console.log(`[GHL Sync] Moved opportunity ${existing.id} to stage ${outcome}`);
      } else {
        try {
          await ghlCreateOpportunity({
            pipelineId: OUTBOUND_PIPELINE_ID,
            pipelineStageId: targetStageId,
            contactId: ghlContactId,
            name: `${contactName ?? "Contact"} – ${CALL_OUTCOME_LABELS[outcome] ?? outcome}`,
            status: "open",
          });
          console.log(`[GHL Sync] Created new opportunity for ${ghlContactId} at stage ${outcome}`);
        } catch (createErr) {
          const message = createErr instanceof Error ? createErr.message : String(createErr);
          if (message.includes("duplicate opportunity")) {
            const retry = await ghlSearchOpportunities(OUTBOUND_PIPELINE_ID, ghlContactId);
            const anyExisting = retry.opportunities?.[0];
            if (anyExisting) {
              await ghlUpdateOpportunity(anyExisting.id, {
                pipelineId: OUTBOUND_PIPELINE_ID,
                pipelineStageId: targetStageId,
              });
              console.log(`[GHL Sync] Recovered duplicate by updating opportunity ${anyExisting.id}`);
            } else {
              throw createErr;
            }
          } else {
            throw createErr;
          }
        }
      }
    } catch (err) {
      reportSyncFailure("update opportunity stage", ghlContactId, err);
    }
  }, []);

  return { refreshOpportunityMirror, updateOpportunityStage };
}
