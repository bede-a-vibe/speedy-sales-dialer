import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

function isAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as Record<string, unknown>;
  // Supabase returns these codes/messages for expired/invalid tokens
  if (err.code === "PGRST301" || err.code === "401") return true;
  if (typeof err.message === "string") {
    const msg = err.message.toLowerCase();
    if (msg.includes("jwt expired") || msg.includes("invalid jwt") || msg.includes("not authenticated")) {
      return true;
    }
  }
  if (typeof err.status === "number" && err.status === 401) return true;
  return false;
}

let lastAuthToastAt = 0;

function handleAuthError() {
  const now = Date.now();
  // Debounce to avoid spamming if multiple queries fail at once
  if (now - lastAuthToastAt < 10_000) return;
  lastAuthToastAt = now;

  toast.error("Session expired", {
    description: "Please sign in again to continue.",
    duration: 10_000,
    action: {
      label: "Sign in",
      onClick: () => {
        window.location.href = "/auth";
      },
    },
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "An unexpected error occurred";
}

export function createAppQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (isAuthError(error)) {
          handleAuthError();
          return;
        }
        // Only show toast for queries that have already been successful once (background refetch failures)
        if (query.state.data !== undefined) {
          toast.error("Failed to refresh data", {
            description: getErrorMessage(error),
            duration: 5_000,
          });
        }
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (isAuthError(error)) {
          handleAuthError();
          return;
        }
        // Only show generic toast if the mutation doesn't have its own onError
        if (!mutation.options.onError) {
          toast.error("Action failed", {
            description: getErrorMessage(error),
            duration: 5_000,
          });
        }
      },
    }),
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          // Don't retry auth errors
          if (isAuthError(error)) return false;
          return failureCount < 2;
        },
        staleTime: 15_000,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
