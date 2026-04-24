import { useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { FileUp, Loader2, Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useContactCallLogs } from "@/hooks/useCallLogs";
import { OUTCOME_CONFIG, type CallOutcome } from "@/data/mockData";
import type { Tables } from "@/integrations/supabase/types";

type Contact = Tables<"contacts">;

const NO_CALL_LOG_VALUE = "__none__";
const MAX_TXT_BYTES = 200 * 1024;
const MIN_TRANSCRIPT_CHARS = 50;

type Props = { contact: Contact };

export function ManualTranscriptUpload({ contact }: Props) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [transcript, setTranscript] = useState("");
  const [callLogId, setCallLogId] = useState<string>(NO_CALL_LOG_VALUE);
  const [callDate, setCallDate] = useState<string>("");
  const [duration, setDuration] = useState<string>("");
  const [generateSummary, setGenerateSummary] = useState(true);
  const [pushToGhl, setPushToGhl] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const { data: callLogPages } = useContactCallLogs(contact.id, 10, true);
  const callLogs = useMemo(
    () => callLogPages?.pages.flatMap((p) => p.items) ?? [],
    [callLogPages],
  );

  const handleFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".txt")) {
      toast.error("Only .txt files are supported");
      return;
    }
    if (file.size > MAX_TXT_BYTES) {
      toast.error("File too large — max 200KB. Paste larger transcripts directly.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setTranscript(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  const reset = () => {
    setTranscript("");
    setCallLogId(NO_CALL_LOG_VALUE);
    setCallDate("");
    setDuration("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (transcript.trim().length < MIN_TRANSCRIPT_CHARS) {
      toast.error(`Transcript must be at least ${MIN_TRANSCRIPT_CHARS} characters`);
      return;
    }

    setSubmitting(true);
    try {
      const durationSeconds = duration ? Number.parseInt(duration, 10) : null;
      const { data, error } = await supabase.functions.invoke("manual-transcript-ingest", {
        body: {
          contactId: contact.id,
          callLogId: callLogId === NO_CALL_LOG_VALUE ? null : callLogId,
          transcript: transcript.trim(),
          callDate: callDate || null,
          durationSeconds: Number.isFinite(durationSeconds as number) ? durationSeconds : null,
          generateSummary,
          pushToGhl,
        },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Failed to save transcript");

      const parts: string[] = ["Transcript saved"];
      if (data.callLogUpdated) parts.push("call log updated");
      if (data.noteIds?.summaryNoteId) parts.push("AI summary generated");
      if (data.ghlEnqueued) parts.push("queued for GHL");
      toast.success(parts.join(" · "));

      if (data.aiWarning) {
        toast.warning(data.aiWarning, { description: "You can retry from the notes panel." });
      }

      queryClient.invalidateQueries({ queryKey: ["contact-notes", contact.id] });
      queryClient.invalidateQueries({ queryKey: ["contact-notes-paginated", contact.id] });
      queryClient.invalidateQueries({ queryKey: ["contact-call-logs", contact.id] });

      reset();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save transcript");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <FileUp className="h-4 w-4" />
          Manual Transcript Upload
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Use this when the Dialpad webhook didn't sync. Paste the transcript or upload a .txt file.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Link to call (optional)</Label>
          <Select value={callLogId} onValueChange={setCallLogId}>
            <SelectTrigger className="border-border bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CALL_LOG_VALUE}>Don't link, just save transcript</SelectItem>
              {callLogs.map((log) => {
                const cfg = OUTCOME_CONFIG[log.outcome as CallOutcome];
                return (
                  <SelectItem key={log.id} value={log.id}>
                    {format(new Date(log.created_at), "dd MMM, h:mma")} — {cfg?.label ?? log.outcome}
                    {log.dialpad_total_duration_seconds
                      ? ` (${Math.floor(log.dialpad_total_duration_seconds / 60)}m ${log.dialpad_total_duration_seconds % 60}s)`
                      : ""}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Duration (sec)</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="e.g. 240"
              className="border-border bg-card"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Call date</Label>
            <Input
              type="date"
              value={callDate}
              onChange={(e) => setCallDate(e.target.value)}
              className="border-border bg-card"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Transcript</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Upload .txt
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>
          <Textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Paste transcript here, or upload a .txt file…"
            className="min-h-[160px] text-sm border-border font-mono"
          />
          <p className="text-[10px] text-muted-foreground font-mono">
            {transcript.length} chars {transcript.length > 0 && transcript.length < MIN_TRANSCRIPT_CHARS && (
              <span className="text-destructive">· need {MIN_TRANSCRIPT_CHARS - transcript.length} more</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-1">
          <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
            <Checkbox checked={generateSummary} onCheckedChange={(v) => setGenerateSummary(v === true)} />
            Generate AI summary
          </label>
          <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
            <Checkbox
              checked={pushToGhl}
              onCheckedChange={(v) => setPushToGhl(v === true)}
              disabled={!contact.ghl_contact_id}
            />
            Push to GHL {!contact.ghl_contact_id && <span className="text-muted-foreground">(no GHL link)</span>}
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={reset} disabled={submitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || transcript.trim().length < MIN_TRANSCRIPT_CHARS}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Processing…
              </>
            ) : (
              "Save & Process"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}