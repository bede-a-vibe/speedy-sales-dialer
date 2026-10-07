import { AppLayout } from "@/components/AppLayout";
import { FathomConnectCard } from "@/components/fathom/FathomConnect";

export default function ConnectorsPage() {
  return (
    <AppLayout title="Connectors">
      <div className="mx-auto max-w-2xl space-y-4">
        <p className="text-sm text-muted-foreground">
          Connect your own meeting tools so recordings and summaries attach to your appointments
          automatically. Each person connects their own account — your keys are stored securely and
          never shown again.
        </p>
        <FathomConnectCard />
      </div>
    </AppLayout>
  );
}
