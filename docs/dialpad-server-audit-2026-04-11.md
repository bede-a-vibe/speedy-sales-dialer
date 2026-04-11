# Dialpad server audit note

Scope reviewed: `supabase/functions/dialpad/index.ts`

## Highest-value gap fixed

Authenticated users could pass an arbitrary `dialpad_user_id` to multiple Dialpad actions, while the edge function executed those requests with the shared server-side `DIALPAD_API_KEY`.

Impact before fix:
- place calls as another rep
- fetch another rep's caller IDs
- resolve or force-hangup another rep's live call
- inspect another rep's Dialpad availability

Fix implemented:
- added server-side `resolveAuthorizedDialpadUserId(...)`
- non-admin users are now restricted to their own active `dialpad_settings` assignment
- admins can still target an explicit `dialpad_user_id`, or fall back to their own assignment
- applied to `initiate_call`, `get_caller_ids`, `log_call`, `resolve_call`, `force_hangup`, and `check_user_status`

## Remaining weak point worth addressing next

`extractWebhookPayload()` still accepts raw JSON bodies without proving they came from Dialpad. If Dialpad is expected to send signed JWT payloads, this is a spoofing path. Fastest next fix: require a verifiable signature/header for JSON webhook bodies, or reject unsigned JSON entirely once the production webhook format is confirmed.
