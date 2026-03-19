import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Loader2, PhoneOff, Radio, Clock, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useContactNotes } from "@/hooks/useContactNotes";
import { supabase } from "@/integrations/supabase/client";

interface DialpadSyncPanelProps {
  contactId?: string;
  activeDialpadCallId: string | null;
  activeDialpadCallState: string | null;
  onCancelCall: () => void;
  isCancelling: boolean;
  isStatusPending: boolean;
  isEndingCall: boolean;
  isResolving?: boolean;
  enabled?: boolean;
  callStartedAt?: number | null;
}

function formatElapsed(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`;
}

export function DialpadSyncPanel({
  contactId,
  activeDialpadCallId,
  activeDialpadCallState,
  onCancelCall,
  isCancelling,
  isStatusPending,
  isEndingCall,
  isResolving = false,
  enabled = true,
  callStartedAt = null,
}: DialpadSyncPanelProps) {
  const { data: contactNotes = [], refetch: refetchNotes } = useContactNotes(contactId, {
    enabled: enabled && !!contactId,
    refetchInterval: enabled && contactId ? 15000 : false,
  });

  const isLinking = isResolving && !activeDialpadCallId;

  // ── Linking elapsed timer ──
  const [linkingElapsed, setLinkingElapsed] = useState(0);
  useEffect(() => {
    if (!isLinking) {
      setLinkingElapsed(0);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      setLinkingElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isLinking]);

  // ── Live call elapsed timer ──
  const [callElapsed, setCallElapsed] = useState(0);
  useEffect(() => {
    if (!callStartedAt || activeDialpadCallState === "hangup") {
      setCallElapsed(0);
      return;
    }
    const interval = setInterval(() => {
      setCallElapsed(Math.floor((Date.now() - callStartedAt) / 1000));
    }, 1000);
    // Set initial value
    setCallElapsed(Math.floor((Date.now() - callStartedAt) / 1000));
    return () => clearInterval(interval);
  }, [callStartedAt, activeDialpadCallState]);

  // ── Realtime subscription for live transcript/summary updates ──
  useEffect(() => {
    if (!contactId || !activeDialpadCallId) return;

    const channel = supabase
      .channel(`notes-live-${contactId}-${activeDialpadCallId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "contact_notes",
          filter: `contact_id=eq.${contactId}`,
        },
        () => {
          // Refetch notes when new ones arrive via webhook sync
          refetchNotes();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [contactId, activeDialpadCallId, refetchNotes]);

  const latestDialpadSummary = contactNotes.find((note) => note.source === "dialpad_summary") ?? null;
  const latestDialpadTranscript = contactNotes.find((note) => note.source === "dialpad_transcript") ?? null;

  const isCallActive = activeDialpadCallId && activeDialpadCallState !== "hangup";

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <label className="block text-[10px] uppercase tracking-widest text-muted-foreground">
          Dialpad Sync
        </label>
        <div className="flex items-center gap-2">
          {/* Live call timer */}
          {isCallActive && callStartedAt && callElapsed > 0 && (
            <Badge variant="outline" className="gap-1 text-[10px] font-mono font-medium tabular-nums">
              <Clock className="h-2.5 w-2.5" />
              {formatElapsed(callElapsed)}
            </Badge>
          )}
          {isLinking && (
            <Badge variant="secondary" className="animate-pulse gap-1.5 bg-amber-500/15 text-amber-600 border-amber-500/30 text-[10px] font-medium">
              <Radio className="h-3 w-3" />
              Linking… {linkingElapsed}s
            </Badge>
          )}
          {isCallActive && (
            <Badge variant="secondary" className="gap-1.5 bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px] font-medium">
              <Zap className="h-3 w-3" />
              Live
            </Badge>
          )}
          {!activeDialpadCallId && !isLinking && activeDialpadCallState === "live" && (
            <Badge variant="secondary" className="gap-1.5 bg-blue-500/15 text-blue-600 border-blue-500/30 text-[10px] font-medium">
              <Radio className="h-3 w-3" />
              Live (untracked)
            </Badge>
          )}
          {activeDialpadCallId && activeDialpadCallState === "hangup" && (
            <Badge variant="outline" className="gap-1.5 text-[10px] font-medium text-muted-foreground">
              Ended
            </Badge>
          )}
        </div>
      </div>
      <div className="space-y-3 text-sm">
        {activeDialpadCallId ? (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
              Call linked · transcript and AI summary will sync after Dialpad finishes processing.
              {activeDialpadCallState ? ` State: ${activeDialpadCallState}.` : ""}
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
        ) : isResolving ? (
          <div className="space-y-3">
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 font-mono text-xs text-muted-foreground">
              <Loader2 className="mr-2 inline h-3 w-3 animate-spin" />
              Connecting to Dialpad… waiting for call confirmation ({linkingElapsed}s).
            </div>
            <Button
              variant="outline"
              onClick={onCancelCall}
              disabled={isCancelling || isEndingCall}
              className="w-full border-destructive text-destructive hover:bg-destructive/10"
            >
              {isCancelling || isEndingCall ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PhoneOff className="mr-2 h-4 w-4" />
              )}
              Cancel Call
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
