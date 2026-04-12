import { format } from "date-fns";
import { Loader2, Mail, Sparkles } from "lucide-react";
import type { EmailDraftSuggestion, EmailDraftSuggestionStatus } from "@/lib/emailDraftSuggestions";
import { buildEmailDraftSuggestionAuditTrail } from "@/lib/emailDraftSuggestions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface EmailDraftSuggestionCardProps {
  suggestion: EmailDraftSuggestion | null;
  status: EmailDraftSuggestionStatus;
  onGenerate: () => void;
  disabled?: boolean;
}

function formatStamp(value?: string | null) {
  if (!value) return "—";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return format(parsed, "dd MMM yy · HH:mm");
}

export function EmailDraftSuggestionCard({ suggestion, status, onGenerate, disabled }: EmailDraftSuggestionCardProps) {
  const isGenerating = status === "generating";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
              Draft Email Suggestion
            </CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              Generate a review-only follow-up draft from the latest call context. Nothing is sent from here.
            </p>
          </div>
          <Badge variant="outline" className="shrink-0">
            Safe preview only
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onGenerate} disabled={disabled || isGenerating}>
            {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {suggestion ? "Refresh suggestion" : "Generate suggestion"}
          </Button>
          <Badge variant={suggestion ? "secondary" : "outline"}>{status}</Badge>
          {suggestion?.context.contactEmail && (
            <Badge variant="outline" className="gap-1">
              <Mail className="h-3 w-3" /> {suggestion.context.contactEmail}
            </Badge>
          )}
        </div>

        {!suggestion ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            No draft generated yet. Use this to preview a backend-ready suggestion object before any delivery flow is added.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Subject</p>
                <p className="mt-1 text-sm font-medium text-foreground">{suggestion.subject}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Body</p>
                <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-sm text-foreground">
                  {suggestion.body}
                </pre>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {buildEmailDraftSuggestionAuditTrail(suggestion).map((item) => (
                <div key={item.label} className="rounded-lg border border-border p-3">
                  <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-sm text-foreground">{item.label === "Generated" ? formatStamp(item.value) : item.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Context used</p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                <li>Contact: {suggestion.context.contactName}</li>
                <li>Business: {suggestion.context.businessName}</li>
                <li>Industry: {suggestion.context.industry || "Not captured"}</li>
                <li>Latest call: {formatStamp(suggestion.context.latestCallAt)}</li>
                <li>Latest note: {formatStamp(suggestion.context.latestNoteAt)}</li>
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
