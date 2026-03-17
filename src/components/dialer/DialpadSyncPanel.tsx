import { format } from "date-fns";
import { Loader2, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useContactNotes } from "@/hooks/useContactNotes";

interface DialpadSyncPanelProps {
  contactId?: string;
  activeDialpadCallId: string | null;
  activeDialpadCallState: string | null;
  onCancelCall: () => void;
  isCancelling: boolean;
  isStatusPending: boolean;
  isEndingCall: boolean;
  enabled?: boolean;
}

export function DialpadSyncPanel({
  contactId,
  activeDialpadCallId,
  activeDialpadCallState,
  onCancelCall,
  isCancelling,
  isStatusPending,
  isEndingCall,
  enabled = true,
}: DialpadSyncPanelProps) {
  const { data: contactNotes = [] } = useContactNotes(contactId, {
    enabled: enabled && !!contactId,
    refetchInterval: enabled && contactId ? 15000 : false,
  });

  const latestDialpadSummary = contactNotes.find((note) => note.source === "dialpad_summary") ?? null;
  const latestDialpadTranscript = contactNotes.find((note) => note.source === "dialpad_transcript") ?? null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <label className="mb-2 block text-[10px] uppercase tracking-widest text-muted-foreground">
        Dialpad Sync
      </label>
      <div className="space-y-3 text-sm">
        {activeDialpadCallId ? (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
              Call linked · transcript and AI summary will sync after Dialpad finishes processing.
              {activeDialpadCallState ? ` Current state: ${activeDialpadCallState}.` : ""}
            </div>
            <Button
              variant="outline"
              onClick={onCancelCall}
              disabled={isCancelling || isStatusPending || isEndingCall || activeDialpadCallState === "hangup"}
              className="w-full border-destructive text-destructive hover:bg-destructive/10"
            >
              {isCancelling || isStatusPending || isEndingCall ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PhoneOff className="mr-2 h-4 w-4" />
              )}
              {activeDialpadCallState === "hangup"
                ? "Call Already Ended"
                : isEndingCall
                  ? "Ending Call..."
                  : "Cancel Active Call"}
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground">
            Waiting for a tracked Dialpad call to reach a loggable state.
          </p>
        )}

        {latestDialpadSummary && (
          <div className="rounded-md border border-border bg-background px-3 py-3">
            <p className="mb-2 text-[10px] uppercase tracking-widest text-primary">Latest synced summary</p>
            <p className="whitespace-pre-wrap text-sm text-foreground">{latestDialpadSummary.content}</p>
          </div>
        )}

        {latestDialpadTranscript && (
          <div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
            Transcript synced · {format(new Date(latestDialpadTranscript.created_at), "MMM d, h:mm a")}
          </div>
        )}
      </div>
    </div>
  );
}

export default DialpadSyncPanel;
