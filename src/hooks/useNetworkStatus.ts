import { useEffect, useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

/**
 * Reactive hook that tracks browser online/offline status.
 */
export function useNetworkStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
