

## Plan: Live GHL Custom Fields panel in the dialer

Render the GHL custom fields, organized into the same folder groups you have in GHL, directly on the active contact card during a call. Reps fill them out as they talk; values save to Supabase immediately and sync to GHL automatically.

### What you'll see on the dialer

A new collapsible panel **"Contact Intelligence"** between the existing "Decision Maker" panel and the "Sales Toolkit", with one tab per GHL folder you showed:

```
┌─ Contact Intelligence ─ [GHL synced ✓]──────────┐
│ [Qualification] [Business] [Digital] [Call AI]  │
│ [Gatekeeper]    [General]  [Additional]         │
│                                                  │
│ ── Qualification & Buying Signals ──────────────│
│ Buying Signal Strength    [Hot ▾]               │
│ Budget Indication         [$5k–$10k ▾]          │
│ Authority Level           [Decision Maker ▾]    │
│ Timeline                  [______________]      │
│ Pain Points               [______________]      │
│ Current Solution          [______________]      │
│ Competitor                [______________]      │
│ Ready to Buy?             [Yes ▾]               │
│                                                  │
│ Last saved 2s ago · Synced to GHL ✓             │
└──────────────────────────────────────────────────┘
```

**Behavior**
- Tabs match your GHL folders exactly: Qualification & Buying Signals, Business Profile, Digital Presence & Opportunity, AI Call Intelligence, Gatekeeper Intelligence, Call Activity, General Info, Additional Info, (OLD) Location, Contact
- Fields render based on GHL field type: `TEXT` → input, `LARGE_TEXT` → textarea, `DROPDOWN`/`RADIO` → select with the picklist options pulled from GHL, `NUMERICAL` → number input, `DATE` → date picker, `CHECKBOX`/`SINGLE_OPTIONS` → multi-select chips
- Auto-save with **1.5s debounce** per field — no save button. Status indicator shows "Saving…" → "Saved" → "Synced to GHL ✓"
- Persisted in **two places** on every change: Supabase `contacts` row (for fast reads/queue logic) and GHL via `update_contact_fields` (for CRM truth)
- If GHL push fails, falls back to the existing `pending_ghl_pushes` retry queue so values aren't lost
- Folder tab badges show how many fields in that folder are filled (e.g. `Qualification 3/8`)

### Where it lives

`src/pages/DialerPage.tsx` — slotted into the active call sidebar between `<DecisionMakerCapture />` and `<SalesToolkit />`. Already-captured DM/Gatekeeper fields (which are duplicated in your `contacts` table columns) display the same value in both places — editing in one updates the other on the next reload.

### Technical changes

**1. New `src/lib/ghlFieldFolders.ts`**
- Static config mapping each GHL folder name to:
  - tab order/label
  - icon
  - the list of field keys (`contact.buying_signal_strength`, `contact.budget_indication`, etc.) that belong to it
  - per-field UI overrides (placeholder text, helper hint shown to rep)
- Built from your existing `resolveFieldId` map in `supabase/functions/ghl/index.ts` so we know which 55 fields are addressable

**2. New hook `src/hooks/useGHLFieldSchema.ts`**
- Calls `ghlGetCustomFields()` once per session, caches with React Query (5 min stale time)
- Returns a normalized schema: `{ key, id, dataType, picklistOptions[], folder }` per field
- Used by the panel to render the correct input control + options for DROPDOWN/RADIO fields

**3. New hook `src/hooks/useGHLContactFields.ts`**
- For a given Supabase `contact` + `ghlContactId`:
  - Reads the matching column values from the `contacts` row (the ones already mirrored: `dm_name`, `budget_indication`, `buying_signal_strength`, etc.)
  - For GHL-only fields (no Supabase column), fetches `ghlGetContact(ghlContactId)` once and reads `customFields[]`
  - Exposes a `setField(key, value)` that:
    1. Updates local React state (instant UI)
    2. Debounced 1.5s: writes to Supabase column if mirrored, calls `ghlUpdateContactFields(ghlContactId, { [key]: value })` for the GHL push
    3. On GHL failure, enqueues `pending_ghl_pushes` row via the existing retry path

**4. New component `src/components/dialer/ContactIntelligencePanel.tsx`**
- Collapsible card (matches existing `DecisionMakerCapture` styling)
- Tab list driven by `ghlFieldFolders.ts`
- Renders each folder as a 1- or 2-column grid of labeled inputs
- Per-tab counter, per-field "Saving/Saved/Synced" pill, last-saved timestamp at bottom

**5. Edited `src/pages/DialerPage.tsx`**
- Import + render `<ContactIntelligencePanel contact={currentContact} ghlContactId={ghlContactId} />` between the existing DM panel and Sales Toolkit
- Pass through the same `ghlContactId` already resolved for the "View in GHL" link

**6. Edited `src/lib/ghl.ts`**
- No new actions needed (already have `ghlGetCustomFields`, `ghlGetContact`, `ghlUpdateContactFields`)
- Light typing tweak: export a `GhlCustomFieldSchema` type for the schema hook

**7. Migration: add any missing Supabase columns for fields we want fast queue access to** (e.g., `timeline`, `current_solution`, `competitor`, `ready_to_buy`)
- Most qualification fields already exist on `contacts` (per the schema you showed). For any GHL field we want filterable in the dialer queue but missing from the table, add nullable `text` columns
- Will list the exact additions after reading the resolveFieldId map; estimate ~6–10 new columns

### Out of scope

- Bulk-editing custom fields from a list view (this is dialer-only for now)
- Surfacing custom fields in the contact list / contact detail pages — easy follow-up once the panel is proven
- Two-way realtime sync from GHL → dialer panel mid-call (the existing `ghl-webhook` already updates the Supabase row, so a contact reload picks it up; live mid-call refresh isn't worth the complexity yet)
- Adding fields that don't already exist in your GHL location — this only renders what GHL gives us
- Editing GHL field definitions/picklists from inside the app (do that in GHL)

