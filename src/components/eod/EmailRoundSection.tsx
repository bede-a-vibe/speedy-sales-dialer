import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, Copy, Loader2, Mail, MailWarning, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { generateFollowUpEmailDraft } from "@/lib/emailDraftGenerator";
import {
  createEmailDraftSuggestion,
  type EmailDraftSuggestion,
} from "@/lib/emailDraftSuggestions";
import { loadStoredEmailDraftSuggestion, saveStoredEmailDraftSuggestion } from "@/lib/emailDraftStore";

/**
 * "Tonight's email round" — leads the rep flagged in the dialer as worth an
 * email, with the AI draft that was written when the call was logged. Nothing
 * is sent from here: drafts open in the rep's own email app (or copy/paste),
 * and the rep marks each one sent or skipped.
 */

type FlaggedLead = {
  id: string;
  business_name: string;
  contact_person: string | null;
  dm_name: string | null;
  email: string | null;
  dm_email: string | null;
  industry: string | null;
  eod_email_flagged_at: string | null;
};

// Melbourne midnight for "today", as a UTC instant. Melbourne is +10/+11
// depending on daylight saving — try both and keep the one that maps back.
function melbourneDayStartIso(): string {
  const tz = "Australia/Melbourne";
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const dateStr = fmt.format(new Date());
  for (const offset of ["+11:00", "+10:00"]) {
    const candidate = new Date(`${dateStr}T00:00:00${offset}`);
    if (fmt.format(candidate) === dateStr) return candidate.toISOString();
  }
  return new Date(`${dateStr}T00:00:00+10:00`).toISOString();
}

const MAILTO_BODY_CAP = 1500;

function leadRecipient(lead: FlaggedLead) {
  return lead.email || lead.dm_email || null;
}

function leadContactName(lead: FlaggedLead) {
  return lead.contact_person || lead.dm_name || lead.business_name;
}

function LeadCard({
  lead,
  repName,
  onDone,
}: {
  lead: FlaggedLead;
  repName: string;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const recipient = leadRecipient(lead);
  const [draft, setDraft] = useState<EmailDraftSuggestion | null>(() => loadStoredEmailDraftSuggestion(lead.id));
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const markSent = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("contacts")
        .update({ eod_email_sent_at: new Date().toISOString() })
        .eq("id", lead.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Marked ${lead.business_name} as sent.`);
      onDone();
      void queryClient.invalidateQueries({ queryKey: ["eod-email-round"] });
    },
    onError: () => toast.error("Couldn't mark that as sent — try again."),
  });

  const skip = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("contacts")
        .update({ eod_email_flagged_at: null, eod_email_flagged_by: null })
        .eq("id", lead.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.info(`${lead.business_name} removed from the email round.`);
      onDone();
      void queryClient.invalidateQueries({ queryKey: ["eod-email-round"] });
    },
    onError: () => toast.error("Couldn't skip that lead — try again."),
  });

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const generated = await generateFollowUpEmailDraft({
        contactName: leadContactName(lead),
        businessName: lead.business_name,
        industry: lead.industry || undefined,
        repName,
        draftGoal: "follow_up",
      });
      if (!generated) throw new Error("No draft returned");
      const suggestion = createEmailDraftSuggestion({
        subject: generated.subject,
        body: generated.body,
        context: {
          contactId: lead.id,
          contactName: leadContactName(lead),
          businessName: lead.business_name,
          industry: lead.industry,
          repName,
          contactEmail: recipient,
          scheduledFor: null,
          draftGoal: "follow_up",
          callNotes: null,
          callTranscriptSummary: null,
          recentCallContexts: [],
          latestCallAt: null,
          latestNoteAt: null,
        },
      });
      saveStoredEmailDraftSuggestion(suggestion);
      setDraft(suggestion);
    } catch {
      toast.error("Draft generation failed — try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
      setCopied(true);
      toast.success("Draft copied");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy draft");
    }
  };

  const mailtoHref = useMemo(() => {
    if (!recipient || !draft) return null;
    const body = draft.body.length > MAILTO_BODY_CAP ? `${draft.body.slice(0, MAILTO_BODY_CAP).trimEnd()}…` : draft.body;
    return `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(body)}`;
  }, [recipient, draft]);

  return (
    <div className="rounded-lg border border-border bg-background p-3 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{lead.business_name}</p>
          <p className="truncate text-xs text-muted-foreground">{leadContactName(lead)}</p>
        </div>
        {recipient ? (
          <Badge variant="outline" className="gap-1">
            <Mail className="h-3 w-3" /> {recipient}
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 border-amber-500/50 text-amber-600 dark:text-amber-400">
            <MailWarning className="h-3 w-3" /> No email captured
          </Badge>
        )}
      </div>

      {draft ? (
        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1.5">
          <p className="text-xs font-medium text-foreground">Subject: {draft.subject}</p>
          <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-sans text-xs text-muted-foreground">
            {draft.body}
          </pre>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No draft yet — generate one from the lead's details.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {mailtoHref ? (
          <Button size="sm" className="h-7 px-2.5 text-xs" asChild>
            <a href={mailtoHref}>
              <Mail className="mr-1 h-3.5 w-3.5" /> Open in my email
            </a>
          </Button>
        ) : null}
        {draft ? (
          <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => void handleCopy()}>
            {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
            Copy draft
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
            onClick={() => void handleGenerate()}
            disabled={generating}
          >
            {generating ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
            Generate draft
          </Button>
        )}
        <span className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2.5 text-xs"
          onClick={() => skip.mutate()}
          disabled={skip.isPending || markSent.isPending}
        >
          <X className="mr-1 h-3.5 w-3.5" /> Skip
        </Button>
        <Button
          size="sm"
          className="h-7 px-2.5 text-xs"
          onClick={() => markSent.mutate()}
          disabled={markSent.isPending || skip.isPending}
        >
          <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Mark sent
        </Button>
      </div>
    </div>
  );
}

export function EmailRoundSection({ userId, repName }: { userId: string; repName: string }) {
  const roundQuery = useQuery({
    queryKey: ["eod-email-round", userId],
    enabled: !!userId,
    queryFn: async () => {
      const [{ data: pending, error: pendingErr }, { count: sentToday, error: sentErr }] = await Promise.all([
        supabase
          .from("contacts")
          .select("id,business_name,contact_person,dm_name,email,dm_email,industry,eod_email_flagged_at")
          .eq("eod_email_flagged_by", userId)
          .not("eod_email_flagged_at", "is", null)
          .is("eod_email_sent_at", null)
          .order("eod_email_flagged_at", { ascending: true }),
        supabase
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .eq("eod_email_flagged_by", userId)
          .gte("eod_email_sent_at", melbourneDayStartIso()),
      ]);
      if (pendingErr) throw pendingErr;
      if (sentErr) throw sentErr;
      return { pending: (pending ?? []) as FlaggedLead[], sentToday: sentToday ?? 0 };
    },
  });

  // Reload drafts if the dialer tab wrote new ones while this page was open.
  const [, setDraftTick] = useState(0);
  const refreshDrafts = useCallback(() => setDraftTick((t) => t + 1), []);
  useEffect(() => {
    window.addEventListener("focus", refreshDrafts);
    return () => window.removeEventListener("focus", refreshDrafts);
  }, [refreshDrafts]);

  if (!roundQuery.data) return null;
  const { pending, sentToday } = roundQuery.data;
  if (pending.length === 0 && sentToday === 0) return null;

  const total = pending.length + sentToday;

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Mail className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Tonight's email round</p>
        <Badge variant="outline" className="font-mono">
          {pending.length === 0 ? `${total} of ${total} sent` : `${sentToday} of ${total} sent`}
        </Badge>
      </div>
      {pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Round cleared — every flagged lead has had its email. Nice work.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Leads you flagged in the dialer today. Open the draft in your email app, personalise it, send, then mark it done.
          </p>
          <div className="space-y-2">
            {pending.map((lead) => (
              <LeadCard
                key={`${lead.id}-${lead.eod_email_flagged_at ?? ""}`}
                lead={lead}
                repName={repName}
                onDone={() => void roundQuery.refetch()}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
