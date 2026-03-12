import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, CheckCircle2 } from "lucide-react";

export default function UploadPage() {
  const [isDragging, setIsDragging] = useState(false);
  const [uploaded, setUploaded] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    // Mock upload
    setUploaded(true);
    setTimeout(() => setUploaded(false), 3000);
  };

  return (
    <AppLayout title="Upload Lists">
      <div className="max-w-2xl mx-auto space-y-6">
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-muted-foreground/50"
          }`}
        >
          {uploaded ? (
            <>
              <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-4" />
              <p className="text-sm font-semibold text-foreground">Upload Complete!</p>
              <p className="text-xs text-muted-foreground mt-1">30 contacts imported successfully.</p>
            </>
          ) : (
            <>
              <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm font-semibold text-foreground">Drop your CSV file here</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                or click below to browse
              </p>
              <Button variant="outline" className="border-border">
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Browse Files
              </Button>
            </>
          )}
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
            Required CSV Columns
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              "Business Name", "Phone Number", "GMB Link", "Website URL",
              "Email Address", "Industry", "Contact Person*", "City/State*",
            ].map((col) => (
              <div key={col} className="text-xs font-mono text-muted-foreground bg-secondary px-3 py-2 rounded-md">
                {col}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">* Optional fields</p>
        </div>
      </div>
    </AppLayout>
  );
}
