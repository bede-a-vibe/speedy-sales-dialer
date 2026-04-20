import { useGHLBookingSync } from "./ghl/useGHLBookingSync";
import { useGHLContactSync } from "./ghl/useGHLContactSync";
import { useGHLFollowUpSync } from "./ghl/useGHLFollowUpSync";
import { useGHLOpportunityMirror } from "./ghl/useGHLOpportunityMirror";

/**
 * Compatibility barrel that composes all focused GHL sync hooks.
 * For new code, prefer importing the specific hook directly from `@/hooks/ghl/*`.
 */
export function useGHLSync() {
  const { pushCallNote, pushDNC } = useGHLContactSync();
  const { pushBooking } = useGHLBookingSync();
  const { pushFollowUp, pushFollowUpEmailDraft } = useGHLFollowUpSync();
  const { refreshOpportunityMirror, updateOpportunityStage } = useGHLOpportunityMirror();

  return {
    pushCallNote,
    pushBooking,
    pushFollowUp,
    pushFollowUpEmailDraft,
    pushDNC,
    refreshOpportunityMirror,
    updateOpportunityStage,
  };
}

export { useGHLBookingSync, useGHLContactSync, useGHLFollowUpSync, useGHLOpportunityMirror };
