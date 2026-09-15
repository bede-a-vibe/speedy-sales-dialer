import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  clearShortSessionMarker,
  evaluateSessionPolicy,
  getStaySignedIn,
  touchShortSession,
} from "@/lib/sessionPersistence";

const CHECK_INTERVAL_MS = 30_000;
const ACTIVITY_EVENTS = ["mousedown", "keydown", "wheel", "touchstart", "visibilitychange"] as const;

/** Enforces the "stay signed in" preference on this device. */
export function useSessionPolicy() {
  useEffect(() => {
    let ended = false;

    const endSession = async (reason: string) => {
      if (ended) return;
      ended = true;
      clearShortSessionMarker();
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // Ignore — we redirect regardless.
      }
      toast.info(reason);
      window.location.assign("/auth");
    };

    const check = () => {
      if (getStaySignedIn()) return;
      const verdict = evaluateSessionPolicy();
      if (verdict === "ok") return;
      void endSession(
        verdict === "idle"
          ? "Signed out after 30 minutes of inactivity."
          : verdict === "expired"
            ? "Your short sign-in session has ended."
            : "Signed out because you chose not to stay signed in.",
      );
    };

    check();
    const timer = window.setInterval(check, CHECK_INTERVAL_MS);
    const onActivity = () => touchShortSession();
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));

    return () => {
      window.clearInterval(timer);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, onActivity));
    };
  }, []);
}
