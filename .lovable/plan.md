## Plan: Make the dialer Filters actually return contacts

Right now the Filters panel renders fine and the SQL behind it works, but most filter pickers will silently collapse the queue to **0 contacts** because they're filtering on data the database doesn't have, or on values that don't match what's stored. This plan fixes the three real bugs and removes the filters/options that have nothing to filter against, so reps can trust every filter they see.

### What's actually wrong (verified against the database, 31,017 contacts)

| Filter | What the UI sends | What's in the DB | Result |
|---|---|---|---|
| Industry | `Plumbers`, `Electricians`, `HVAC`, `Builders`, `Renovators` | Same — **works** | ✅ |
| State | `NSW`, `VIC`, `QLD`, etc. | Same (uppercased compare) — **works** | ✅ |
| Phone Type | `mobile`, `landline`, `business_line`, `unknown` | `mobile` (22k), `landline` (6.9k), `unknown` (1.9k) — **works** (but `business_line` matches 0) | ⚠️ |
| Trade Type | `Plumbers`, `Electricians`, `Builders`, `Renovators`, `HVAC`, `Roofers`, … (28 options) | `Electrical`, `Plumbing`, `HVAC`, `Renovations`, `Building & Construction` (5 only) | ❌ all but HVAC return 0 |
| Google Ads / Facebook Ads | `Yes - Active`, `Yes - Paused`, `No`, `Unknown` (capitalized) | Every row is `unknown` (lowercase) | ❌ all options return 0 |
| Prospect Tier | `Tier 1 - Hot` … | **0 rows have a value** | ❌ |
| Buying Signal | `Strong`, `Moderate`, `Weak`, `None` | **0 rows have a value** | ❌ |
| GBP Rating (≥) | 4.5 / 4.0 / 3.5 / 3.0 | **0 rows have a value** (column exists but empty) | ❌ |
| Min Reviews (≥) | 100 / 50 / 20 / 10 | 0 rows populated | ❌ |
| Work Type | Residential / Commercial / Mixed | **0 rows have a value** | ❌ |
| Business Size | Sole Trader / 2-5 / etc. | **0 rows have a value** | ❌ |
| DM Reachability | `yes` / `no` | 0 rows have `dm_phone` set | ❌ "yes" returns 0 |
| Contact Owner | rep `user_id` / `unassigned` | `uploaded_by` populated for imports — **works** | ✅ |

The "Hot today" and "DM direct" presets set Tier=Tier 1 + Signal=Strong, or DM Reachability=yes, so they also collapse the queue to 0. That's why presets feel broken.

### Fix in three layers

**1. Make the filters that should work, work (data normalization in the RPC)**

Update `claim_dialer_leads` and `get_dialer_queue_count` so the four mismatched filters compare case-insensitively and accept either form:

- **`has_google_ads` / `has_facebook_ads`**: compare with `LOWER(c.has_google_ads) = LOWER(_has_google_ads)` and treat `Unknown`/`unknown` as the same value. Also normalize `Yes - Active` and `Yes - Paused` to match what the data ingest writes (today: only `unknown` exists, but once enrichment lands the UI options will match).
- **`trade_type`**: build a small mapping in the RPC so UI labels (`Plumbers`, `Electricians`, `Builders`, `Renovators`, `Roofers`) also match the stored canonical values (`Plumbing`, `Electrical`, `Building & Construction`, `Renovations`, `Roofing`). Keep the existing `industry` fallback. Result: trade-type filter works for the 5 categories that have data.
- **`phone_type`**: no DB change needed — just remove `business_line` from the UI options since 0 rows have it.

This is a single new SQL migration that re-creates the two RPCs with the same signatures.

**2. Hide filters with no data behind a "Show enrichment-only filters" toggle**

In `AdvancedFilters.tsx`, group the picker into two rows:

- **Active filters (always visible)**: Calling presets, Industry, State, Contact Owner, Phone Type, Trade Type
- **Enrichment-only filters (collapsed behind "Advanced enrichment filters ▾")**: Prospect Tier, Buying Signal, GBP Rating, Min Reviews, Work Type, Business Size, DM Reachability, Google Ads, Facebook Ads

Each enrichment filter gets a small grey hint under its label: "0 contacts have this set yet" computed from a one-time `useEnrichmentCoverage()` query (`SELECT count() FILTER (WHERE …)` per column, cached for 10 min). Once data lands in those columns the hint updates automatically and the filter becomes useful.

This way a rep opening the panel sees only filters that will return contacts, but admins can still expand to use the enrichment ones once the data is populated by the GHL/AI sync.

**3. Repair the broken presets**

In `DialerPage.tsx` `applyPreset()`:

- **Hot today** → only set what we have data for: leave Prospect Tier / Buying Signal alone (they'd zero the queue), instead set `phoneType = "mobile"` and `industries` left as user chose. Add a small helper toast: "Hot today is limited until lead scoring data is populated — showing best-quality mobiles."
- **DM direct dials** → keep `phoneType = "mobile"` only; remove `setHasDmPhone("yes")` since 0 rows have a DM phone. Toast: "No DM phone numbers captured yet — filtering on mobile lines."
- **DM capture** → set `phoneType = "landline"` only (where you'd most need a DM); remove `hasDmPhone = "no"`.
- **Google Ads** → leave `hasGoogleAds` unset until enrichment writes real values; show toast "Google Ads enrichment data not available yet."
- **High reviews** → same deferral toast.
- **Landline enrichment** → keep `phoneType = "landline"`, remove `hasDmPhone = "no"`.

Once enrichment data starts flowing the presets can be re-armed without UI changes.

### Diagnostics so we catch the next "filter returns 0" bug fast

Add a tiny "Queue preview" line under the filters: **"~3,275 contacts match these filters"** that calls `get_dialer_queue_count` (already exists) every time filters change, debounced 250ms. If it returns 0, swap the line to red: **"No contacts match — try removing a filter"** with a one-click "Reset filters" button. This already half-exists via `previewCount`; we just surface it next to the Filters card header instead of hiding it inside the queue health badge.

### Technical changes

- **New SQL migration**: re-create `claim_dialer_leads` and `get_dialer_queue_count` with case-insensitive `has_google_ads`/`has_facebook_ads` matching and a `trade_type` UI→canonical mapping CTE.
- **`src/data/constants.ts`**: remove `"business_line"` from `PHONE_TYPE_OPTIONS`. Add a `TRADE_TYPE_LABELS` mapping (`"Plumbers" → "Plumbing"` etc.) used only for display alignment.
- **`src/components/dialer/AdvancedFilters.tsx`**: split rows into "Active" + collapsible "Advanced enrichment filters". Add per-field "0 contacts have this set" hint driven by props.
- **New hook `src/hooks/useEnrichmentCoverage.ts`**: single `SELECT` returning counts per enrichment column, cached 10 min.
- **`src/pages/DialerPage.tsx`**: rewrite `applyPreset()` per the table above; surface the queue preview count next to the Filters header with reset CTA.

### Out of scope

- Backfilling Prospect Tier / Buying Signal / GBP Rating / DM Phone — that's the GHL/AI enrichment pipeline's job and unblocks those filters automatically.
- Adding new filter columns (e.g. "Last sentiment", "Has objection logged") — only fixing what's already exposed.
- Touching the Contacts page filters (different code path, different UX, no reported issue).
- Changing the queue scoring algorithm or cooldown rules.