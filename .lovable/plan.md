

## Plan: Generate email drafts for ALL follow-up outcomes

### What changed
The email draft feature only triggers when the follow-up method is set to `"email"` (line 1054 in `DialerPage.tsx`). On April 1st, the rep happened to select "email" as the method — since then, all follow-ups have been "call" method, so no drafts were generated. The feature is working, it's just gated behind a method check.

Additionally, the `generate-email-draft` edge function currently uses `OPENAI_API_KEY` which is **not configured** — meaning it always falls back to a static template. We should migrate this to use the Lovable AI Gateway so it works without needing an external API key.

### Changes

**1. Remove the email-method gate in DialerPage.tsx**
- Remove the `if (method === "email")` condition around `pushFollowUpEmailDraft` (around line 1054)
- Email drafts will now be generated and pushed to GHL for every follow-up outcome regardless of method

**2. Remove the email-method gate in QuickBookDialog.tsx**
- Same change — remove the `if (followUpMethod === "email")` condition (around line 535)

**3. Migrate `generate-email-draft` edge function to Lovable AI Gateway**
- Replace the direct OpenAI API call with the Lovable AI Gateway (`https://ai-gateway.lovable.dev/v1/chat/completions`)
- Use `LOVABLE_API_KEY` (auto-available) instead of `OPENAI_API_KEY`
- Use model `openai/gpt-5-mini` for good quality at reasonable cost
- This eliminates the dependency on a missing API key and ensures AI-generated drafts work immediately

**4. Redeploy the edge function**

### Result
Every follow-up outcome (call, email, or prospecting) will generate a personalised AI email draft and push it as a note to the GHL contact record, using the Lovable AI Gateway for generation.

