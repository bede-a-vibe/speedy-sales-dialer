# Fix the wrong "direct line" on Todd Elec, and let reps reject it from the contact page

## What happened
Todd Elec Pty Ltd has two numbers: the main mobile (+61 405 217 155, the one Ben called and booked on) and a scraped "decision maker direct line" (+61 432 509 992, "Todd"). That second number was never confirmed. You called it and it belongs to someone who owns a different business.

The dialer was already skipping it (it rings the main mobile until a rep confirms the direct line). But the contact page still shows it in green as "Decision maker direct line", which makes it look trustworthy. That page also has no button to reject it. The dialer screen has one.

## Changes
1. **Clean up Todd Elec now.** Remove +61 432 509 992 as Todd's direct line, and put it on the blocked list so enrichment can't add it back. Leave a note on the contact timeline saying why.
2. **Check whether the same number sits on any other business.** If it does, remove it there too.
3. **Contact page direct-line box:**
   - Show it amber and "Unconfirmed" until a rep confirms it. It only turns green once it's confirmed.
   - Add the same two buttons the dialer has: "Right person — confirm" and "Wrong person — remove number". Removing it blocks the number for good.

## Technical details
- Contact 735b660c-96c0-42c3-9b93-0908675773d4: set dm_phone to null and dm_phone_verified to false, add the number to the existing DM blocklist used for the 549 suspect numbers, and add a contact_notes entry.
- Query contacts.dm_phone on the last 9 digits (432509992) to find the number on other businesses.
- ContactDetailPage DM card: reuse the confirm/reject handlers and styling from ContactCard, which is shared with the dialer. The call-number logic in dialTarget.ts stays the same.
