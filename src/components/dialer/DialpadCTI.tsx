import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff, Minimize2, Maximize2, Wifi, WifiOff, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──

interface DialpadCTIProps {
  /** The Dialpad CTI Client ID (provided by Dialpad after setup) */
  clientId: string | null;
  /** Whether the CTI panel should be visible */
  visible: boolean;
  /** Toggle visibility */
  onToggleVisible: () => void;
  /** Phone number to dial (E.164 format) */
  phoneNumber?: string | null;
  /** Whether to auto-initiate the call when phoneNumber changes */
  autoInitiateCall?: boolean;
  /** Outbound caller ID to use (E.164 format) */
  outboundCallerId?: string | null;
  /** Custom data to attach to the call (max 2000 chars) */
  customData?: string | null;
  /** Callback when the CTI reports a ringing event */
  onCallRinging?: (payload: CallRingingPayload) => void;
  /** Callback when user auth state changes in the CTI */
  onAuthChange?: (authenticated: boolean, userId?: number) => void;
}

export interface CallRingingPayload {
  state: "on" | "off";
  id: number;
  contact: {
    id: string;
    phone: string;
    type: string;
    name: string;
    email: string;
  };
  target: {
    id: number;
    phone: string;
    type: string;
    name: string;
    email: string;
  };
  internal_number: string;
  external_number: string;
}

interface CTIMessage {
  api: "opencti_dialpad";
  version: "1.0";
  method: string;
  payload?: Record<string, unknown>;
}

// ── Constants ──

const CTI_BASE_URL = "https://dialpad.com/apps";
const CTI_API = "opencti_dialpad";
const CTI_VERSION = "1.0";
const CTI_TARGET_ORIGIN = "https://dialpad.com";

// ── Component ──

export function DialpadCTI({
  clientId,
  visible,
  onToggleVisible,
  phoneNumber,
  autoInitiateCall = false,
  outboundCallerId,
  customData,
  onCallRinging,
  onAuthChange,
}: DialpadCTIProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isMinimised, setIsMinimised] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const lastDialledRef = useRef<string | null>(null);

  // ── Listen for messages from the CTI iframe ──
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Only accept messages from Dialpad
      if (event.origin !== CTI_TARGET_ORIGIN) return;

      const data = event.data as CTIMessage;
      if (data?.api !== CTI_API) return;

      switch (data.method) {
        case "user_authentication": {
          const authenticated = data.payload?.user_authenticated === true;
          const userId = data.payload?.user_id as number | undefined;
          setIsAuthenticated(authenticated);
          onAuthChange?.(authenticated, userId);
          break;
        }
        case "call_ringing": {
          const payload = data.payload as unknown as CallRingingPayload;
          onCallRinging?.(payload);
          break;
        }
        default:
          console.log("[DialpadCTI] Unknown message method:", data.method);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onAuthChange, onCallRinging]);

  // ── Send a postMessage to the CTI iframe ──
  const sendMessage = useCallback(
    (method: string, payload?: Record<string, unknown>) => {
      if (!iframeRef.current?.contentWindow) return;
      const message: CTIMessage = {
        api: CTI_API,
        version: CTI_VERSION,
        method,
        ...(payload ? { payload } : {}),
      };
      iframeRef.current.contentWindow.postMessage(message, CTI_TARGET_ORIGIN);
    },
    [],
  );

  // ── Enable the current tab when iframe loads ──
  useEffect(() => {
    if (iframeLoaded && clientId) {
      // Small delay to ensure the CTI is fully initialised
      const timer = setTimeout(() => {
        sendMessage("enable_current_tab");
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [iframeLoaded, clientId, sendMessage]);

  // ── Auto-initiate call when phoneNumber changes ──
  useEffect(() => {
    if (
      !autoInitiateCall ||
      !phoneNumber ||
      !iframeLoaded ||
      !isAuthenticated ||
      phoneNumber === lastDialledRef.current
    ) {
      return;
    }

    lastDialledRef.current = phoneNumber;

    const payload: Record<string, unknown> = {
      enable_current_tab: true,
      phone_number: phoneNumber,
    };

    if (outboundCallerId) {
      payload.outbound_caller_id = outboundCallerId;
    }

    if (customData) {
      payload.custom_data = customData.slice(0, 2000);
    }

    sendMessage("initiate_call", payload);
  }, [
    autoInitiateCall,
    phoneNumber,
    outboundCallerId,
    customData,
    iframeLoaded,
    isAuthenticated,
    sendMessage,
  ]);

  // ── Public action: initiate a call ──
  const initiateCall = useCallback(
    (number: string, callerId?: string, data?: string) => {
      const payload: Record<string, unknown> = {
        enable_current_tab: true,
        phone_number: number,
      };
      if (callerId) payload.outbound_caller_id = callerId;
      if (data) payload.custom_data = data.slice(0, 2000);
      sendMessage("initiate_call", payload);
      lastDialledRef.current = number;
    },
    [sendMessage],
  );

  // ── Public action: hang up all calls ──
  const hangUpAll = useCallback(() => {
    sendMessage("hang_up_all_calls");
    lastDialledRef.current = null;
  }, [sendMessage]);

  // ── Reset last dialled when phoneNumber is cleared ──
  useEffect(() => {
    if (!phoneNumber) {
      lastDialledRef.current = null;
    }
  }, [phoneNumber]);

  // ── No client ID configured ──
  if (!clientId) {
    return visible ? (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Dialpad CTI
          </h3>
          <Button variant="ghost" size="sm" onClick={onToggleVisible}>
            <Minimize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <WifiOff className="mb-2 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Dialpad CTI not configured
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Set <code className="rounded bg-muted px-1 py-0.5 text-[10px]">VITE_DIALPAD_CTI_CLIENT_ID</code> in
            your environment to enable embedded calling.
          </p>
        </div>
      </div>
    ) : null;
  }

  // ── Minimised state ──
  if (isMinimised && visible) {
    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Phone className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-medium">Dialpad</span>
            {isAuthenticated ? (
              <Wifi className="h-3 w-3 text-green-500" />
            ) : (
              <WifiOff className="h-3 w-3 text-amber-500" />
            )}
          </div>
          <div className="flex items-center gap-1">
            {phoneNumber && isAuthenticated && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => initiateCall(phoneNumber, outboundCallerId || undefined)}
              >
                <Phone className="mr-1 h-3 w-3" />
                Call
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-destructive"
              onClick={hangUpAll}
            >
              <PhoneOff className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setIsMinimised(false)}>
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!visible) return null;

  // ── Full CTI panel ──
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <Phone className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Dialpad
          </span>
          {isAuthenticated ? (
            <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600">
              <Wifi className="h-2.5 w-2.5" /> Connected
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600">
              <LogIn className="h-2.5 w-2.5" /> Sign in below
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setIsMinimised(true)}>
            <Minimize2 className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onToggleVisible}>
            <span className="text-xs">&times;</span>
          </Button>
        </div>
      </div>

      {/* Quick actions */}
      {isAuthenticated && (
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          {phoneNumber && (
            <Button
              variant="default"
              size="sm"
              className="h-7 flex-1 text-xs"
              onClick={() => initiateCall(phoneNumber, outboundCallerId || undefined, customData || undefined)}
            >
              <Phone className="mr-1.5 h-3 w-3" />
              Call {phoneNumber}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={hangUpAll}
          >
            <PhoneOff className="mr-1 h-3 w-3" />
            Hang Up
          </Button>
        </div>
      )}

      {/* CTI iframe */}
      <div className="relative h-[520px]">
        <iframe
          ref={iframeRef}
          src={`${CTI_BASE_URL}/${clientId}`}
          title="Dialpad Mini Dialer"
          allow="microphone; speaker-selection; autoplay; camera; display-capture; hid"
          sandbox="allow-popups allow-scripts allow-same-origin allow-forms"
          onLoad={() => setIframeLoaded(true)}
          className="h-full w-full border-0"
        />
      </div>
    </div>
  );
}

export default DialpadCTI;
