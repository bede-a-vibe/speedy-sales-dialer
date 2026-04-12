import { z } from "zod";
import type { Tables } from "@/integrations/supabase/types";

export const emailDraftSuggestionStatusSchema = z.enum([
  "idle",
  "generating",
  "ready",
  "failed",
]);

export const emailDraftSuggestionChannelSchema = z.enum(["email"]);

const recentCallContextSchema = z.object({
  createdAt: z.string(),
  outcome: z.string(),
  notes: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  transcriptExcerpt: z.string().nullable().optional(),
});

export const emailDraftSuggestionContextSchema = z.object({
  contactId: z.string(),
  contactName: z.string(),
  businessName: z.string(),
  industry: z.string().nullable().optional(),
  repName: z.string(),
  contactEmail: z.string().nullable().optional(),
  scheduledFor: z.string().nullable().optional(),
  draftGoal: z.enum(["follow_up", "booked_prep"]).default("follow_up"),
  callNotes: z.string().nullable().optional(),
  callTranscriptSummary: z.string().nullable().optional(),
  recentCallContexts: z.array(recentCallContextSchema).default([]),
  latestCallAt: z.string().nullable().optional(),
  latestNoteAt: z.string().nullable().optional(),
});

export const emailDraftSuggestionSchema = z.object({
  id: z.string(),
  channel: emailDraftSuggestionChannelSchema,
  status: emailDraftSuggestionStatusSchema,
  generatedAt: z.string(),
  source: z.enum(["ai", "template"]),
  subject: z.string(),
  body: z.string(),
  context: emailDraftSuggestionContextSchema,
});

export type EmailDraftSuggestionStatus = z.infer<typeof emailDraftSuggestionStatusSchema>;
export type EmailDraftSuggestionContext = z.infer<typeof emailDraftSuggestionContextSchema>;
export type EmailDraftSuggestion = z.infer<typeof emailDraftSuggestionSchema>;

type Contact = Tables<"contacts">;
type CallLog = Tables<"call_logs">;
type ContactNote = Tables<"contact_notes">;

function buildTranscriptExcerpt(value?: string | null, maxLength = 280) {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.length <= maxLength ? cleaned : `${cleaned.slice(0, maxLength).trimEnd()}…`;
}

export function buildEmailDraftSuggestionContext(args: {
  contact: Contact;
  repName: string;
  latestCall?: Pick<CallLog, "created_at" | "notes" | "dialpad_summary" | "outcome" | "dialpad_transcript"> | null;
  latestNote?: Pick<ContactNote, "created_at" | "content"> | null;
  recentCalls?: Pick<CallLog, "created_at" | "notes" | "dialpad_summary" | "outcome" | "dialpad_transcript">[] | null;
  scheduledFor?: string | null;
}): EmailDraftSuggestionContext {
  const { contact, repName, latestCall, latestNote, recentCalls, scheduledFor } = args;
  const resolvedScheduledFor = scheduledFor || contact.next_followup_date || contact.meeting_booked_date || null;
  const draftGoal = contact.status === "booked" || Boolean(contact.meeting_booked_date || scheduledFor)
    ? "booked_prep"
    : "follow_up";
  const recentCallContexts = (recentCalls ?? []).slice(0, 3).map((call) => ({
    createdAt: call.created_at,
    outcome: call.outcome,
    notes: call.notes || null,
    summary: call.dialpad_summary || null,
    transcriptExcerpt: buildTranscriptExcerpt(call.dialpad_transcript),
  }));

  return {
    contactId: contact.id,
    contactName: contact.contact_person || contact.dm_name || contact.business_name,
    businessName: contact.business_name,
    industry: contact.industry || null,
    repName,
    contactEmail: contact.email || contact.dm_email || null,
    scheduledFor: resolvedScheduledFor,
    draftGoal,
    callNotes: latestCall?.notes || contact.follow_up_note || latestNote?.content || null,
    callTranscriptSummary: latestCall?.dialpad_summary || recentCallContexts.map((call) => call.summary).filter(Boolean).join("\n\n") || null,
    recentCallContexts,
    latestCallAt: latestCall?.created_at || null,
    latestNoteAt: latestNote?.created_at || null,
  };
}

export function createEmailDraftSuggestion(args: {
  subject: string;
  body: string;
  context: EmailDraftSuggestionContext;
}): EmailDraftSuggestion {
  const trimmedBody = args.body.trim();
  const source = trimmedBody.includes("90-day KPI guarantee") ? "template" : "ai";

  return emailDraftSuggestionSchema.parse({
    id: `draft-${args.context.contactId}-${Date.now()}`,
    channel: "email",
    status: "ready",
    generatedAt: new Date().toISOString(),
    source,
    subject: args.subject.trim(),
    body: trimmedBody,
    context: args.context,
  });
}

export function buildEmailDraftSuggestionAuditTrail(suggestion: EmailDraftSuggestion) {
  return [
    { label: "Channel", value: suggestion.channel },
    { label: "Status", value: suggestion.status },
    { label: "Source", value: suggestion.source },
    { label: "Draft goal", value: suggestion.context.draftGoal === "booked_prep" ? "Booked prep" : "Follow-up" },
    { label: "Generated", value: suggestion.generatedAt },
    { label: "Recipient", value: suggestion.context.contactEmail || "No email captured" },
    { label: "Scheduled", value: suggestion.context.scheduledFor || "Not scheduled" },
    { label: "Calls used", value: String(suggestion.context.recentCallContexts.length || 0) },
  ];
}
