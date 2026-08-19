import type { ToolContext } from "@lovable.dev/mcp-js";

export function unauthenticated() {
  return {
    content: [{ type: "text" as const, text: "Not authenticated. Sign in to Speedy Dialer and reconnect." }],
    isError: true,
  };
}

export function failure(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function json(data: unknown, structured?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    ...(structured ? { structuredContent: structured } : {}),
  };
}

export function requireUser(ctx: ToolContext): string | null {
  return ctx.isAuthenticated() ? (ctx.getUserId() ?? null) : null;
}