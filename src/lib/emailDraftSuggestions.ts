import { z } from "zod";
import type { Tables } from "@/integrations/supabase/types";

export const emailDraftSuggestionStatusSchema = z.enum([
  "idle",
  "generating",
  "ready",
  "failed",
]);

export const emailDraftSuggestionChannelSchema = z.enum(["email"]);

export const emailDraftSuggestionContextSchema = z.object({
  contactId: z.string(),
  contactName: z.string(),
  businessName: z.string(),
  industry: z.string().nullable().optional(),
  repName: z.string(),
  contactEmail: z.string().nullable().optional(),
  scheduledFor: z.string().nullable().optional(),
  callNotes: z.string().nullable().optional(),
  callTranscriptSummary: z.string().nullable().optional(),
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

export function buildEmailDraftSuggestionContext(args: {
  contact: Contact;
  repName: string;
  latestCall?: Pick<CallLog, "created_at" | "notes" | "dialpad_summary"> | null;
  latestNote?: Pick<ContactNote, "created_at" | "content"> | null;
  scheduledFor?: string | null;
}): EmailDraftSuggestionContext {
  const { contact, repName, latestCall, latestNote, scheduledFor } = args;

  return {
    contactId: contact.id,
    contactName: contact.contact_person || contact.dm_name || contact.business_name,
    businessName: contact.business_name,
    industry: contact.industry || null,
    repName,
    contactEmail: contact.email || contact.dm_email || null,
    scheduledFor: scheduledFor || contact.next_followup_date || contact.meeting_booked_date || null,
    callNotes: latestCall?.notes || contact.follow_up_note || latestNote?.content || null,
    callTranscriptSummary: latestCall?.dialpad_summary || null,
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
    { label: "Generated", value: suggestion.generatedAt },
    { label: "Recipient", value: suggestion.context.contactEmail || "No email captured" },
    { label: "Scheduled", value: suggestion.context.scheduledFor || "Not scheduled" },
  ];
}
