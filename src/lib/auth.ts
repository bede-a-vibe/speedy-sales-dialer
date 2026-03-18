import { supabase } from "@/integrations/supabase/client";

export const AUTH_REQUEST_TIMEOUT_MS = 15000;

export function clearLocalAuthStorage() {
  if (typeof window === "undefined") return;

  const authKeys = Object.keys(window.localStorage).filter(
    (key) => key.startsWith("sb-") && (key.includes("-auth-token") || key.includes("-code-verifier")),
  );

  authKeys.forEach((key) => window.localStorage.removeItem(key));
}

export async function resetLocalAuthState() {
  try {
    const signOutPromise = supabase.auth.signOut({ scope: "local" });
    await Promise.race([
      signOutPromise,
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch {
    // Ignore local cleanup failures and continue with storage purge.
  }

  clearLocalAuthStorage();
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}
