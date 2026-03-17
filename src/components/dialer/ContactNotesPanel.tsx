import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useContactNotes } from "@/hooks/useContactNotes";
import { useContactCallLogs } from "@/hooks/useCallLogs";

interface ContactNotesPanelProps {
  contactId?: string;
  notes: string;
  onNotesChange: (value: string) => void;
  enabled?: boolean;
}

function HistorySkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

export function ContactNotesPanel({ contactId, notes, onNotesChange, enabled = true }: ContactNotesPanelProps) {
  const { data: contactNotes = [], isLoading: isNotesLoading } = useContactNotes(contactId, {
    enabled,
    refetchInterval: enabled ? 15000 : false,
  });
  const {
    data: callLogPages,
    isLoading: isCallLogsLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useContactCallLogs(contactId, 5, enabled);

  const callLogs = callLogPages?.pages.flatMap((page) => page.items) ?? [];
  const hasHistory = contactNotes.length > 0 || callLogs.length > 0;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4">
        <label className="mb-2 block text-[10px] uppercase tracking-widest text-muted-foreground">
          Call Notes
        </label>
        <Textarea
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder="Type notes during or after the call..."
          className="min-h-[100px] resize-none border-border bg-background font-mono text-sm"
        />
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Notes & history</p>
          {hasNextPage && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              className="border-border"
            >
              {isFetchingNextPage ? "Loading..." : "Load more"}
            </Button>
          )}
        </div>

        {isNotesLoading || isCallLogsLoading ? (
          <HistorySkeleton />
        ) : hasHistory ? (
          <ScrollArea className="h-[280px] pr-3">
            <div className="space-y-3">
              {contactNotes.map((note) => (
                <div key={note.id} className="rounded-md border border-border bg-background px-3 py-3">
                  <div className="mb-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span>{note.source.replaceAll("_", " ")}</span>
                    <span>{format(new Date(note.created_at), "MMM d, h:mm a")}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{note.content}</p>
                </div>
              ))}

              {callLogs.map((callLog) => (
                <div key={callLog.id} className="rounded-md border border-border bg-secondary px-3 py-3">
                  <div className="mb-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span>{callLog.outcome.replaceAll("_", " ")}</span>
                    <span>{format(new Date(callLog.created_at), "MMM d, h:mm a")}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{callLog.notes || "No notes recorded."}</p>
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <p className="text-sm text-muted-foreground">No synced notes or call history for this contact yet.</p>
        )}
      </div>
    </div>
  );
}

export default ContactNotesPanel;
