import { WifiOff } from "lucide-react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

export function OfflineBanner() {
  const isOnline = useNetworkStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-destructive-foreground text-sm font-medium shadow-lg animate-in slide-in-from-top-2">
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>You're offline — changes won't be saved until you reconnect.</span>
    </div>
  );
}
