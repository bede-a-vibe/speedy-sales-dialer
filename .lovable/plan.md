

# Fix: Infinite "Loading..." when backend is unavailable

## Problem
When a user visits the site at `/`, the `ProtectedApp` component loads and `useAuth.tsx` calls `supabase.auth.getSession()`. When the backend database is down (Status 544), this promise **hangs indefinitely** — it neither resolves nor rejects. The `loading` state stays `true`, so the user sees "Loading..." forever before ever being redirected to `/auth`.

The console logs confirm the app does eventually render (both ProtectedRoutes and AuthPage appear), so the architecture is correct. The problem is purely that `getSession()` has no timeout.

## Fix

### `src/hooks/useAuth.tsx`
- Wrap `getSession()` with a **5-second timeout** using `Promise.race`
- Add a **hard 10-second safety timer** that forces `loading = false` regardless
- On timeout, set `session = null` and `user = null` so the app redirects to `/auth`

### `src/lib/auth.ts`
- Add timeout to `resetLocalAuthState()` so that `signOut({ scope: "local" })` doesn't also hang when the backend is down

## Changes

**`src/hooks/useAuth.tsx`** — core fix:
```typescript
useEffect(() => {
  let isMounted = true;

  // Safety fallback: force loading=false after 10s no matter what
  const safetyTimer = setTimeout(() => {
    if (isMounted) setLoading(false);
  }, 10_000);

  // Wrap getSession with a 5s timeout
  const sessionPromise = supabase.auth.getSession();
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Session fetch timed out")), 5000)
  );

  Promise.race([sessionPromise, timeoutPromise])
    .then(({ data: { session: s } }) => {
      if (!isMounted) return;
      setSession(s);
      setUser(s?.user ?? null);
    })
    .catch(() => {
      // Timeout or network failure — treat as no session
      if (!isMounted) return;
      setUser(null);
      setSession(null);
    })
    .finally(() => {
      if (isMounted) setLoading(false);
      clearTimeout(safetyTimer);
    });

  // ... onAuthStateChange listener unchanged
```

**`src/lib/auth.ts`** — prevent `resetLocalAuthState` from hanging:
```typescript
export async function resetLocalAuthState() {
  try {
    const signOutPromise = supabase.auth.signOut({ scope: "local" });
    await Promise.race([
      signOutPromise,
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch { /* ignore */ }
  clearLocalAuthStorage();
}
```

## Expected outcome
- Backend healthy: no change in behavior, session loads normally
- Backend down: user sees "Loading..." for at most 5 seconds, then gets redirected to `/auth` where they see the login form (and will get a clear timeout error if they try to sign in)

