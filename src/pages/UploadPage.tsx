import { AppLayout } from "@/components/AppLayout";
import { AlertCircle } from "lucide-react";

export default function UploadPage() {
  return (
    <AppLayout title="Upload Lists">
      <div className="max-w-2xl mx-auto rounded-lg border border-border bg-card p-8 text-center space-y-3">
        <AlertCircle className="h-10 w-10 mx-auto text-amber-500" />
        <h2 className="text-lg font-semibold text-foreground">Direct upload is deprecated</h2>
        <p className="text-sm text-muted-foreground">
          This workspace is now GHL-first. Import leads into GoHighLevel and let the
          <span className="font-medium"> ghl-webhook </span>
          sync lightweight operational cache records into Supabase.
        </p>
      </div>
    </AppLayout>
  );
}
