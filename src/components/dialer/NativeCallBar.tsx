import { useEffect, useState } from "react";
import { Phone, PhoneOff, Radio, Loader2, ExternalLink, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type NativeCallState = "idle" | "dialing" | "ringing" | "connected" | "ended";

interface NativeCallBarProps {
  businessName: string | null;
  phoneNumber: string | null;
  state: NativeCallState;
  connectedAt: number | null;
  dialpadAuthenticated: boolean;
  onHangUp: () => void;
  onRevealDialpad: () => void;
}

function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/**
 * Halo-styled native call bar. Drives the visible in-call UI from CTI
 * postMessage events — the rep is never blocked on server confirmation.
 */
export function NativeCallBar({
  businessName,
  phoneNumber,
  state,
  connectedAt,
  dialpadAuthenticated,
  onHangUp,
  onRevealDialpad,
}: NativeCallBarProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (state !== "connected" || !connectedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [state, connectedAt]);

  const stateLabel =
    state === "dialing" ? "Dialing…" :
    state === "ringing" ? "Ringing" :
    state === "connected" ? "Connected" :
    state === "ended" ? "Call ended" :
    "Idle";

  const stateTone =
    state === "connected" ? "text-emerald-600 dark:text-emerald-400" :
    state === "ringing" ? "text-sky-600 dark:text-sky-400" :
    state === "dialing" ? "text-amber-600 dark:text-amber-400" :
    "text-muted-foreground";

  const timer = state === "connected" && connectedAt ? formatDuration(now - connectedAt) : null;

  return (
    <div
      className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm"
      data-testid="native-call-bar"
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            state === "connected"
              ? "bg-emerald-500/15"
              : state === "ringing"
                ? "bg-sky-500/15 animate-pulse"
                : state === "dialing"
                  ? "bg-amber-500/15 animate-pulse"
                  : "bg-muted",
          )}
        >
          {state === "dialing" ? (
            <Loader2 className={cn("h-4 w-4 animate-spin", stateTone)} />
          ) : state === "ringing" ? (
            <Radio className={cn("h-4 w-4", stateTone)} />
          ) : state === "connected" ? (
            <Phone className={cn("h-4 w-4", stateTone)} />
          ) : (
            <PhoneOff className={cn("h-4 w-4", stateTone)} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={cn("text-[10px] uppercase tracking-widest font-mono", stateTone)}>
              {stateLabel}
            </p>
            {timer && (
              <span className="tabular-nums text-[11px] font-mono text-muted-foreground">
                {timer}
              </span>
            )}
            <span
              className={cn(
                "ml-auto flex items-center gap-1 text-[10px] font-mono",
                dialpadAuthenticated ? "text-emerald-600" : "text-amber-600",
              )}
              title={dialpadAuthenticated ? "Dialpad connected" : "Sign in to Dialpad"}
            >
              {dialpadAuthenticated ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            </span>
          </div>
          <p className="truncate text-sm font-medium text-foreground">
            {businessName || "Unknown business"}
          </p>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {phoneNumber || "—"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={onRevealDialpad}
            title="Open the full Dialpad panel (keypad, transfer, etc.)"
          >
            <ExternalLink className="mr-1 h-3 w-3" />
            Open Dialpad
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="h-8 text-xs"
            onClick={onHangUp}
            disabled={state === "idle" || state === "ended"}
          >
            <PhoneOff className="mr-1 h-3 w-3" />
            Hang Up
          </Button>
        </div>
      </div>
    </div>
  );
}

export default NativeCallBar;