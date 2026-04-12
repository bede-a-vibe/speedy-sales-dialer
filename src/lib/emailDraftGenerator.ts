import { supabase } from "@/integrations/supabase/client";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

interface EmailDraftParams {
  contactName: string;
  businessName: string;
  industry?: string;
  repName: string;
  draftGoal?: "follow_up" | "booked_prep";
  callNotes?: string;
  callTranscriptSummary?: string;
  recentCallContexts?: Array<{
    createdAt: string;
    outcome: string;
    notes?: string | null;
    summary?: string | null;
    transcriptExcerpt?: string | null;
  }>;
  scheduledFor?: string;
}

interface EmailDraftResult {
  subject: string;
  body: string;
}

const ODIN_DIGITAL_CONTEXT = `
ABOUT ODIN DIGITAL:
Odin Digital is Australia's leading data-driven digital marketing agency. We unite data science with conversion psychology to deliver predictable, scalable growth engines for businesses.

SERVICES:
- Search Engine Optimisation (SEO): +340% avg lead growth, rankings + revenue focus
- Google Ads Management: 6x avg ROAS, reduce CPA by up to 60%
- Facebook & Instagram Ads: 3-5x+ consistent ROAS, psychology-driven ads
- Conversion Rate Optimisation (CRO): 2x avg conversion lift
- Marketing Automation: +47% lead-to-customer rate, email sequences, CRM integration
- Web Design & Development: 5%+ avg conversion rate, mobile-first, speed optimised

THE ODIN METHOD (4 phases):
1. Audit & Discovery — find money left on the table
2. Strategic Blueprint — custom growth plan with clear KPIs
3. Creative Execution — high-converting campaigns across channels
4. Optimisation & Scale — continuous refinement, compound returns

GUARANTEE: If we don't hit the agreed-upon KPIs within 90 days, we work for free until we do.

KEY RESULTS:
- Client went from $20k/month to $100k+/month (Imperial Wealth)
- Revenue up 180% (YCL Jewels)
- ROAS improved from 2x to 6x in 90 days (Mining Store)
- CPA dropped by 62% (Adriatic Furniture)
- Organic traffic up 210% (MicroCloud)

OFFER: Free Growth Blueprint / Odin Method Strategy Session
WEBSITE: odindigital.com.au
`;

const SYSTEM_PROMPT = `You are a professional sales email writer for Odin Digital, an Australian digital marketing agency. You write follow-up emails to trade business owners (plumbers, electricians, HVAC, builders, landscapers, etc.) after an initial phone call.

Your emails must:
1. Be warm, professional, and conversational — not corporate or salesy
2. Reference specific details from the call (what was discussed, their pain points, their current situation)
3. Naturally weave in relevant Odin Digital services that match their needs
4. Use Australian English spelling throughout (e.g. "optimisation" not "optimization", "colour" not "color", "personalised" not "personalized")
5. Be concise — tradies are busy, keep it under 200 words for the body
6. Include a clear, low-pressure call to action (e.g. "Happy to send through a quick audit" or "Would a 15-minute chat next week work?")
7. Sign off with the rep's first name only
8. Sound like a real person wrote it, not AI — use natural language, contractions, and a friendly tone
9. NEVER use generic filler like "I hope this email finds you well"
10. Reference their specific trade/industry where possible

You MUST return a valid JSON object with exactly two keys:
- "subject": A short, compelling email subject line (max 60 chars)
- "body": The full email body text with \\n for line breaks

${ODIN_DIGITAL_CONTEXT}`;

export async function generateFollowUpEmailDraft(
  params: EmailDraftParams,
): Promise<EmailDraftResult | null> {
  const { contactName, businessName, industry, repName, callNotes, callTranscriptSummary, scheduledFor } = params;

  const userPrompt = buildUserPrompt(params);

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      console.error("[Email Draft] Not authenticated");
      return null;
    }

    // Call the edge function to generate the email draft
    const url = `https://${PROJECT_ID}.supabase.co/functions/v1/generate-email-draft`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
      }),
    });

    if (!res.ok) {
      // Fallback: generate locally using a simpler template
      console.warn("[Email Draft] Edge function unavailable, using template fallback");
      return generateTemplateFallback(params);
    }

    const result = await res.json();
    if (result.subject && result.body) {
      return { subject: result.subject, body: result.body };
    }

    return generateTemplateFallback(params);
  } catch (err) {
    console.error("[Email Draft] Generation failed:", err);
    return generateTemplateFallback(params);
  }
}

function buildUserPrompt(params: EmailDraftParams): string {
  const isBookedPrep = params.draftGoal === "booked_prep";
  const parts = [
    isBookedPrep
      ? `Write a booked appointment prep email from ${params.repName} at Odin Digital to ${params.contactName} at ${params.businessName}.`
      : `Write a follow-up email from ${params.repName} at Odin Digital to ${params.contactName} at ${params.businessName}.`,
    `Draft goal: ${isBookedPrep ? "Confirm the value of the booked meeting, reflect the latest conversation, and prepare them for the session." : "Follow up after the latest conversation and move them toward the next step."}`,
  ];

  if (params.industry) {
    parts.push(`Industry/Trade: ${params.industry}`);
  }

  if (params.callTranscriptSummary) {
    parts.push(`\nCall Summary:\n${params.callTranscriptSummary}`);
  }

  if (params.recentCallContexts?.length) {
    parts.push(`\nRecent call context (latest first):\n${params.recentCallContexts
      .map((call, index) => {
        const sections = [
          `Call ${index + 1} (${call.createdAt}, outcome: ${call.outcome})`,
          call.summary ? `Summary: ${call.summary}` : null,
          call.notes ? `Notes: ${call.notes}` : null,
          call.transcriptExcerpt ? `Transcript excerpt: ${call.transcriptExcerpt}` : null,
        ].filter(Boolean);
        return sections.join("\n");
      })
      .join("\n\n")}`);
  }

  if (params.callNotes) {
    parts.push(`\nRep's Notes:\n${params.callNotes}`);
  }

  if (params.scheduledFor) {
    parts.push(`\nFollow-up scheduled for: ${new Date(params.scheduledFor).toLocaleDateString("en-AU")}`);
  }

  parts.push(isBookedPrep
    ? "\nGenerate a personalised review-only booked meeting prep email based on the above context."
    : "\nGenerate a personalised follow-up email based on the above context.");

  return parts.join("\n");
}

function generateTemplateFallback(params: EmailDraftParams): EmailDraftResult {
  const firstName = params.contactName?.split(" ")[0] || "there";
  const repFirst = params.repName?.split(" ")[0] || "The Odin Team";
  const biz = params.businessName || "your business";
  const trade = params.industry || "trade";

  const isBookedPrep = params.draftGoal === "booked_prep";
  const hasNotes = params.callNotes || params.callTranscriptSummary;
  const noteRef = hasNotes
    ? `Really appreciated the chat and the context you shared about ${biz}.`
    : `Great speaking with you about ${biz}.`;

  if (isBookedPrep) {
    const scheduledLabel = params.scheduledFor
      ? new Date(params.scheduledFor).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
      : "our upcoming session";

    return {
      subject: `Looking forward to our session with ${biz}`,
      body: [
        `Hi ${firstName},`,
        "",
        `${noteRef} Looking forward to meeting on ${scheduledLabel}.`,
        "",
        `Ahead of the session, we'll come prepared with a few practical ideas around lead flow, website conversion opportunities, and where Odin Digital could help ${trade} businesses like yours grow more predictably.`,
        "",
        `If there’s anything specific you want us to look at before we jump on, just reply here and I’ll make sure it’s covered.`,
        "",
        `Cheers,`,
        repFirst,
        `Odin Digital`,
        `odindigital.com.au`,
      ].join("\n"),
    };
  }

  const body = [
    `Hi ${firstName},`,
    "",
    `${noteRef} Just wanted to follow up while it’s still fresh.`,
    "",
    `A lot of ${trade} businesses we work with are in a similar spot, they know they need more leads but aren't sure what's actually going to move the needle. That's exactly where we come in.`,
    "",
    `We've helped trades businesses across Australia grow their leads by 340%+ on average through a combination of Google Ads, SEO, and conversion-focused websites, all backed by our 90-day KPI guarantee.`,
    "",
    `Happy to put together a quick, no-obligation Growth Blueprint for ${biz}, it'll show you exactly where the biggest opportunities are and what a realistic growth plan looks like.`,
    "",
    `Would you be open to a quick 15-minute chat to go through it?`,
    "",
    `Cheers,`,
    repFirst,
    `Odin Digital`,
    `odindigital.com.au`,
  ].join("\n");

  return {
    subject: `Quick follow-up, growth ideas for ${biz}`,
    body,
  };
}
