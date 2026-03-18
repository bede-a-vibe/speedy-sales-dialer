import { createClient } from "@supabase/supabase-js";

export const AUTH_REQUEST_TIMEOUT_MS = 15000;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const PRIMARY_AUTH_STORAGE_KEY = `sb-${import.meta.env.VITE_SUPABASE_PROJECT_ID}-auth-token`;

interface AuthClientOptions {
  detectSessionInUrl?: boolean;
  persistSession?: boolean;
  storageKey?: string;
}

function createBrowserSafeFetch(): typeof fetch {
  return async (input, init) => {
    if (typeof window === "undefined") {
      return fetch(input, init);
    }

    const request = input instanceof Request ? input : new Request(input, init);

    return new Promise<Response>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(request.method, request.url, true);

      request.headers.forEach((value, key) => {
        xhr.setRequestHeader(key, value);
      });

      xhr.onload = () => {
        const headers = new Headers();
        xhr
          .getAllResponseHeaders()
          .trim()
          .split(/[\r\n]+/)
          .filter(Boolean)
          .forEach((line) => {
            const separatorIndex = line.indexOf(":");
            if (separatorIndex <= 0) return;
            const key = line.slice(0, separatorIndex).trim();
            const value = line.slice(separatorIndex + 1).trim();
            headers.append(key, value);
          });

        resolve(
          new Response(xhr.responseText, {
            status: xhr.status,
            statusText: xhr.statusText,
            headers,
          }),
        );
      };

      xhr.onerror = () => reject(new TypeError("Failed to fetch"));
      xhr.onabort = () => reject(new DOMException("Request was aborted", "AbortError"));

      if (request.signal) {
        const abortHandler = () => xhr.abort();
        if (request.signal.aborted) {
          xhr.abort();
          return;
        }
        request.signal.addEventListener("abort", abortHandler, { once: true });
      }

      if (request.method === "GET" || request.method === "HEAD") {
        xhr.send();
        return;
      }

      request
        .text()
        .then((body) => xhr.send(body))
        .catch(reject);
    });
  };
}

const browserSafeFetch = createBrowserSafeFetch();

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
    global: {
      fetch: browserSafeFetch,
    },
  });
}

export const authBrowserClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    fetch: browserSafeFetch,
  },
});

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
    await authBrowserClient.auth.signOut({ scope: "local" });
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
