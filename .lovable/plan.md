## Goal

Add two new dispositions to the dialer — **Disqualified (DQ)** and a richer **DNC** with reason — plus a **competitor / existing-agency** intelligence capture so we can filter for high-intent leads. All data stored on the contact record for later CSV export or CRM migration.

---

## 1. Disqualified (DQ) — narrow, well-defined

DQ only has **two** reasons (tight by design so reps can't misuse it):

- `financially_not_qualified` — Can't afford our services (no budget, cashflow issues, business isn't generating enough revenue to invest in marketing).
- `not_looking_to_grow` — Explicitly told us they don't want more leads / customers / to grow.

**Not** DQ reasons: wrong industry, out of area, bad fit, duplicate, competitor. Those either belong to DNC, or to the new competitor/agency capture below, or should just be marked Not Interested.

### Button UX

- New **DQ** outcome button in the dialer's "Other Outcomes" row (icon: `UserX`).
- Below the button label, a one-line helper: *"Only use when they can't afford us OR explicitly don't want to grow. Everything else is Not Interested."*
- Clicking opens a small popover with the two reasons + optional notes. Both required to submit.
- Info tooltip on the button title with the full definition so new reps hovering see it.

## 2. DNC — add a reason + notes

Keep existing `is_dnc` flag. Wrap the existing DNC button in the same reason-picker popover:

- `requested_removal`
- `abusive_or_hostile`
- `wrong_number_repeat`
- `other` (requires notes)

## 3. Competitor / existing-agency capture (new)

New section in the in-call **Contact Intelligence Panel** (already exists) called **"Current Marketing"**:

- Checkbox: **Has existing agency** (competitor)
- If checked, service checkboxes reveal:
  - SEO
  - Google Ads
  - Meta Ads (Facebook/Instagram)
  - Website / landing pages
  - Other (text)
- Optional competitor name field

This is separate from DQ — a business with an agency is *higher intent*, not disqualified. That's the whole point of tracking it.

### New filters in Advanced Filters + Contacts page

- **Existing agency**: Any / Yes / No
- **Services with current agency**: multi-select (SEO, Google Ads, Meta Ads, Website)
- Preset chip: **"Has competitor"** — pre-fills existing agency = Yes for prospecting warm targets

## 4. Data model (migration)

New columns on `public.contacts`:

- `disqualified` boolean, default false, not null
- `disqualified_at` timestamptz
- `disqualified_reason` text — check constraint via trigger: `financially_not_qualified` | `not_looking_to_grow`
- `disqualified_notes` text
- `dnc_reason` text — `requested_removal` | `abusive_or_hostile` | `wrong_number_repeat` | `other`
- `dnc_notes` text
- `dnc_recorded_at` timestamptz
- `has_existing_agency` boolean
- `existing_agency_name` text
- `existing_agency_services` text[] — subset of `seo` | `google_ads` | `meta_ads` | `website` | `other`
- `existing_agency_notes` text

Indexes: `disqualified`, `has_existing_agency`, GIN on `existing_agency_services`. Extend the two `idx_contacts_dialer_queue*` partial indexes to also require `disqualified = false`.

Extend `call_outcome` enum with `disqualified`.

## 5. Dialer queue exclusion + filter surface

Update the three SECURITY DEFINER RPCs (`claim_dialer_leads`, `preview_dialer_leads`, `get_dialer_queue_count`):

- Add `AND c.disqualified IS NOT TRUE` alongside the existing DNC exclusion.
- Add optional parameters: `_include_dnc`, `_include_disqualified`, `_dnc_reasons`, `_dq_reasons`, `_has_existing_agency`, `_existing_agency_services`.
- When `_include_*` is true, bypass the corresponding exclusion so admins can build DQ-only or DNC-only lists via filters.

## 6. GHL sync

Mirror everything as tags so GHL remains the source of truth:

- `DNC`, `DNC:requested_removal`, etc. (extend existing `pushDNC`)
- New `pushDisqualified` — tags `DQ`, `DQ:financially_not_qualified` or `DQ:not_looking_to_grow`. No `dnd:true` (that's DNC-only).
- New `pushExistingAgency` — tags `HasAgency`, `Service:SEO`, `Service:GoogleAds`, `Service:MetaAds`.
- All also written to GHL notes with human-readable context.

## 7. Training page

In `src/pages/TrainingPage.tsx` add a new definitions block at the top of the outcomes section:

- **Disqualified (DQ)** — full definition, the two allowed reasons, and 2–3 examples of what is NOT a DQ (wrong industry → Not Interested; won't answer → No Answer; rude → DNC).
- **DNC** — the four reasons.
- **Has Existing Agency** — why we capture it (higher intent, positioning for takeover), what services to ask about.

Add the same short definitions to the `OUTCOME_CONFIG` metadata so tooltips on the dialer buttons pull from a single source of truth.

## 8. Contacts page

- New filter row: Status = All / Active / DNC / Disqualified / Has Agency
- Reason multi-select appears when DNC or DQ is active
- New badge on contact rows: DQ (with reason abbreviation), DNC (with reason), Agency (with service icons)
- CSV export includes all new columns

## 9. Contact detail page

New **"Status & Marketing"** section:

- DNC toggle + reason + notes + timestamp (admin editable)
- DQ toggle + reason + notes + timestamp (admin editable)
- Existing agency block: toggle, name, services checkboxes, notes (editable by any rep — this is intel)

---

## Technical notes

- `ALTER TYPE call_outcome ADD VALUE 'disqualified'` runs in its own migration statement before code deploys.
- All three dialer RPCs get identical parameter shape so `useDialerSession` passes one filter object.
- Existing `is_dnc` boolean stays — too many downstream references. New reason columns live alongside it.
- DQ vs Not Interested distinction is enforced by button UX + training copy, not by validation (reps can technically still use it wrong, but tight definitions + only two reasons keep it clean).

## Out of scope (ask if you want)

- Backfilling reasons for existing `is_dnc=true` contacts
- Auto-DQ rules (e.g. auto-flag sole traders with <$100k revenue markers)
- Reactivation workflow (undo DQ/DNC from rep UI — admin-only via contact detail for now)
