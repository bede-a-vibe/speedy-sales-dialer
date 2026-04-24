

## Plan: Add "View in GHL" link on the active contact card

Add a small link/button in the `ContactCard` header that opens the contact's profile in GoHighLevel in a new tab, using the GHL contact ID and location ID.

### What you see

In the header row of the active contact card (next to the "I booked this in GHL" button and the industry badge), a new compact icon link:

```
[ iteck electrical solutions ]   [📅 I booked this in GHL] [↗ GHL] [ELECTRICIANS]
```

- Label: `GHL` with an external-link icon
- Styled as a subtle outline button matching the existing header chips
- Tooltip on hover: "Open contact in GoHighLevel"
- Opens `https://app.gohighlevel.com/v2/location/{LOCATION_ID}/contacts/detail/{ghl_contact_id}` in a new tab (`target="_blank"`, `rel="noopener noreferrer"`)
- **Hidden when there's no `ghl_contact_id`** on the contact (e.g. brand-new contact still mid-link). The auto-link effect on the dialer already populates this within ~1s of presenting a lead, so it appears almost immediately.

### Where it appears

- `ContactCard` header — visible on the dialer's active contact card (the screenshot you shared) and anywhere else `ContactCard` is rendered (contact detail expanded views, etc.)

### Technical changes

**1. Expose the GHL location ID to the frontend**

The location ID currently only lives in the edge function as `Deno.env.get("GHL_LOCATION_ID")` — it's not in the Vite env. We'll add a public Vite env var `VITE_GHL_LOCATION_ID` (the location ID is not a secret — it appears in every GHL URL) so the frontend can build the link without a round trip. This requires the user to add the secret in Lovable Cloud after the plan is approved (we'll prompt for it via the secrets flow).

**2. New helper `src/lib/ghlUrls.ts`**
- `getGhlContactUrl(ghlContactId: string): string | null` — returns the full `app.gohighlevel.com/v2/location/{loc}/contacts/detail/{id}` URL, or `null` if the location ID env var isn't set (so the UI can hide the link gracefully instead of producing a broken URL).

**3. Edited `src/components/ContactCard.tsx`**
- Add optional `ghl_contact_id?: string | null` to the `contact` prop type
- In the header row (the same flex container as `headerActions` and the industry badge), render a small outline anchor button when `getGhlContactUrl(contact.ghl_contact_id)` returns a URL. Uses the existing `ExternalLink` icon (already imported) plus a brief "GHL" label.

**4. Edited `src/pages/DialerPage.tsx`**
- Pass `ghl_contact_id` through to `<ContactCard contact={...} />` (currently the Contact prop spread doesn't include it). Falls back to `ghlLink.getCachedGHLId(contact.id)` so it appears as soon as the auto-link completes, even before the database row refreshes.

### Out of scope
- Changing the existing "I booked this in GHL" recovery button
- Adding GHL links anywhere other than the contact card header (e.g. pipeline tables, contacts list) — can be a follow-up if you want it
- Creating a server-side redirect endpoint (the public location ID makes this unnecessary)
- Showing the link before `ghl_contact_id` exists (would require pre-resolving via phone, which is wasteful since auto-link already happens within ~1s)

