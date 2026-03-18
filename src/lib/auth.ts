import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export const AUTH_REQUEST_TIMEOUT_MS = 15000;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const PRIMARY_AUTH_STORAGE_KEY = `sb-${import.meta.env.VITE_SUPABASE_PROJECT_ID}-auth-token`;

interface AuthClientOptions {
  detectSessionInUrl?: boolean;
  persistSession?: boolean;
  storageKey?: string;
}

export function clearLocalAuthStorage() {
  if (typeof window === "undefined") return;

  const authKeys = Object.keys(window.localStorage).filter(
    (key) => key.startsWith("sb-") && (key.includes("-auth-token") || key.includes("-code-verifier")),
  );

  authKeys.forEach((key) => window.localStorage.removeItem(key));
}

function createAuthClient({
  detectSessionInUrl = false,
  persistSession = false,
  storageKey = `sales-dialer-auth-${Date.now()}`,
}: AuthClientOptions = {}) {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession,
      autoRefreshToken: false,
      detectSessionInUrl,
      storageKey,
    },
  });
}

export function createTransientAuthClient() {
  return createAuthClient();
}

export function createPrimaryStorageAuthClient(options: Pick<AuthClientOptions, "detectSessionInUrl"> = {}) {
  return createAuthClient({
    persistSession: true,
    storageKey: PRIMARY_AUTH_STORAGE_KEY,
    detectSessionInUrl: options.detectSessionInUrl,
  });
}

export async function resetLocalAuthState() {
  try {
    await supabase.auth.signOut({ scope: "local" });
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
