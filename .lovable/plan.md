

## Plan: Map all call outcomes to GHL Outbound Prospecting pipeline stages

### Problem
Currently, `pushFollowUp` always **creates a new opportunity** in GHL. It never searches for or updates an existing one. This results in duplicate opportunities and contacts not moving through pipeline stages.

### Outbound Prospecting Pipeline — Stage Mapping

| Call Outcome | GHL Stage | Stage ID |
|---|---|---|
| No Answer | Attempted - No Answer | `b1003ce2-48c6-4ed7-b894-56b2cf6c2313` |
| Voicemail | Attempted - No Answer | `b1003ce2-48c6-4ed7-b894-56b2cf6c2313` |
| Follow Up | Connected - Follow Up Required | `5102204c-7b00-48f9-94fb-70ca529841b9` |
| Booked | Meeting Booked | `d7283fa5-7352-4446-80c6-1e567a7c8295` |
| Not Interested | Not Interested | `01ce436d-4f12-47c8-b178-0333c75be361` |
| DNC | Disqualified / Bad Fit | `cfc8cc1a-66a3-48cc-88cd-975ffcf4e851` |
| Wrong Number | Bad Number / Dead | `79836d51-2ae7-4705-b2d9-4a9e2e461ab6` |

### Changes

**1. Add `update_opportunity` and `search_opportunities` actions to the GHL edge function** (`supabase/functions/ghl/index.ts`)
- `update_opportunity`: PUT to `/opportunities/{id}` — updates stage, status, etc.
- `search_opportunities`: Search opportunities by contact ID in a pipeline to find existing ones

**2. Add client-side wrappers** (`src/lib/ghl.ts`)
- `ghlUpdateOpportunity(opportunityId, payload)` 
- `ghlSearchOpportunities(pipelineId, contactId)`

**3. Update the pipeline contract** (`src/shared/ghlPipelineContract.ts`)
- Add all Outbound Prospecting stage IDs as a `OUTBOUND_STAGES` map
- Add a `CALL_OUTCOME_TO_STAGE` mapping from `CallOutcome` → stage ID

**4. Add `updateOpportunityStage` to `useGHLSync`** (`src/hooks/useGHLSync.ts`)
- New function: search for existing opportunity in Outbound Prospecting pipeline for the contact → if found, update its stage; if not found, create one
- This is called after every call outcome (not just follow-up/booked)

**5. Wire up in DialerPage.tsx**
- After `pushCallNote`, call the new `updateOpportunityStage` for every outcome
- Pass the call outcome so the correct stage is resolved
- Fire-and-forget (same pattern as existing GHL sync)

**6. Wire up in QuickBookDialog.tsx**
- Same stage update for quick-booked follow-ups

**7. Update the pipeline contract in the edge function**
- Inline the stage IDs in the edge function (can't import from `src/`)

### Result
Every call outcome will find or create an opportunity in the Outbound Prospecting pipeline and move it to the correct stage. No more duplicates — existing opportunities get updated.

