## Confirm prefill + verify the two earlier bookings are already correct

### Prefill behavior (already in place)
The "When did you make the call?" field already defaults to the current date + time when the dialog opens, and the user can change it before submitting. No code change needed for the prefill itself.

### The two bookings clicked earlier today
Before this feature shipped, the button stamped:
- `call_logs.created_at` = insert time (Postgres default `now()`) → the moment you clicked the button
- `contacts.last_called_at` = `new Date().toISOString()` → also the moment you clicked

So both of those bookings are **already** logged at the exact time you clicked the button — which you've confirmed is the actual call time. No backfill needed.

### Verification step
Run a read-only query to confirm the two `call_logs` rows from today with `outcome=booked` have `created_at` matching when you clicked (i.e. earlier today, not some other time). If they look right, we're done. If anything's off, I'll fix those specific rows.
