

## Add Create Contact + Enhance Edit Contact

### What exists today
- An **Edit Contact** dialog already lets users update all fields including `contact_person`, phone, email, etc.
- Only **admins** can insert new contacts (per RLS policy). All authenticated users can update.

### Changes

**1. Add "Create Contact" button and dialog to ContactsPage**

Add a "+ New Contact" button next to the Export button (visible to admins only). Clicking it opens a dialog with the same form fields as the edit dialog (business name, contact person, phone, email, industry, website, GMB link, city, state). On submit, insert into `contacts` via Supabase. Required fields: business_name, phone, industry.

**2. Add a `useCreateContact` mutation hook to `useContacts.ts`**

A simple mutation that inserts a new contact row and invalidates relevant query keys.

**3. Minor edit dialog improvements**

The edit dialog already has all the fields. No structural changes needed — it already supports changing `contact_person` (the "boss"). Just ensure it's clearly labeled.

### Technical details

- **RLS**: Admins can insert contacts (existing policy). The create button will only show for admins.
- **Unique constraint**: `(business_name, phone)` exists — the insert will fail gracefully if a duplicate is attempted; we'll show a toast error.
- **New hook**: `useCreateContact()` in `src/hooks/useContacts.ts`
- **Files changed**: `src/hooks/useContacts.ts` (add hook), `src/pages/ContactsPage.tsx` (add button + dialog)

