import { useCallback } from "react";
import { ghlAddNote, ghlAddTag, ghlUpdateContact } from "@/lib/ghl";
import { CALL_OUTCOME_LABELS } from "@/lib/pipelineMappings";
import {
  persistContactMirror,
  reportSyncFailure,
  type PushCallNoteParams,
  type PushDNCParams,
} from "./ghlSyncShared";

export function useGHLContactSync() {
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

  return { pushCallNote, pushDNC };
}
