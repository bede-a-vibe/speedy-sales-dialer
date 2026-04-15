

## Plan: Assign GHL tasks to the matching rep

### Current State
- The `create_task` action in the GHL edge function already supports an `assignedTo` field (GHL user ID)
- A `get_users` action exists to fetch GHL users
- Tasks are currently created **without** `assignedTo`, so they appear unassigned in GHL
- There is **no mapping** between Supabase users and GHL users stored anywhere

### GHL User Mapping (from your screenshot)
| Name | Email | GHL User ID |
|------|-------|-------------|
| Bede Alexander | bede@odindigital.com.au | NFi3vzrTHSOW3wpzu2yU |
| Dean Lodge | dean@odindigital.com.au | YmANuBMRtWVjCVDZ2mRV |
| Kobi Miller | Kobi@odindigital.com.au | ikvOR4Mk6ntXL1DPaBd1 |

### Changes

**1. Add `ghl_user_id` column to `profiles` table**
- Migration: `ALTER TABLE profiles ADD COLUMN ghl_user_id text;`
- This stores the GHL user ID for each Supabase user

**2. Auto-populate GHL user IDs**
- Match by email: compare `profiles.email` against the GHL users list
- Seed the three known mappings via a migration or a one-time edge function call

**3. Pass `assignedTo` when creating GHL tasks**
- In `useGHLSync.pushFollowUp`: look up the current user's `ghl_user_id` from their profile and pass it as `assignedTo` in the `ghlCreateTask` call
- This ensures follow-up tasks in GHL are assigned to the rep who created them

**4. Expose GHL user mapping in Dialpad Settings or a new admin section** (optional)
- Allow admins to manually set/override the `ghl_user_id` for each user
- Use the existing `ghlGetUsers()` to populate a dropdown

### Result
When a rep creates a follow-up, the GHL task will be assigned to their matching GHL user account. Tasks will show up in the correct rep's task list in GHL.

