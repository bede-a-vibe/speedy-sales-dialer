import { useState, useRef } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import Papa from "papaparse";

interface CSVRow {
  [key: string]: string;
}

const REQUIRED_FIELDS = ["business_name", "phone", "industry"];
const OPTIONAL_FIELDS = ["contact_person", "email", "website", "gmb_link", "city", "state"];
const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

const FIELD_ALIASES: Record<string, string[]> = {
  business_name: ["business name", "business", "company", "company name", "name"],
  phone: ["phone", "phone number", "telephone", "tel", "mobile"],
  industry: ["industry", "category", "type", "sector"],
  contact_person: ["contact person", "contact", "contact name", "person", "owner"],
  email: ["email", "email address", "e-mail"],
  website: ["website", "website url", "url", "web", "site"],
  gmb_link: ["gmb link", "gmb", "google my business", "google business", "gmb url", "google maps"],
  city: ["city", "town"],
  state: ["state", "province", "region"],
};

function mapColumn(header: string): string | null {
  const normalized = header.toLowerCase().trim();
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.includes(normalized) || normalized === field) {
      return field;
    }
  }
  return null;
}

export default function UploadPage() {
  const { user } = useAuth();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ success: number; errors: number; total: number } | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processCSV = async (file: File) => {
    if (!user) {
      toast.error("You must be logged in to upload.");
      return;
    }

    setUploading(true);
    setResult(null);
    setParseErrors([]);

    Papa.parse<CSVRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const { data, errors: csvErrors } = results;

        if (csvErrors.length > 0) {
          setParseErrors(csvErrors.map((e) => `Row ${e.row}: ${e.message}`));
        }

        if (data.length === 0) {
          toast.error("No data found in CSV file.");
          setUploading(false);
          return;
        }

        // Map CSV headers to DB fields
        const headers = Object.keys(data[0]);
        const mapping: Record<string, string> = {};
        for (const header of headers) {
          const field = mapColumn(header);
          if (field) mapping[header] = field;
        }

        // Check required fields
        const mappedFields = Object.values(mapping);
        const missingRequired = REQUIRED_FIELDS.filter((f) => !mappedFields.includes(f));
        if (missingRequired.length > 0) {
          toast.error(`Missing required columns: ${missingRequired.join(", ")}`);
          setParseErrors([
            `Could not find columns for: ${missingRequired.join(", ")}`,
            `Found columns: ${headers.join(", ")}`,
          ]);
          setUploading(false);
          return;
        }

        // Transform rows
        const contacts = data.map((row) => {
          const contact: Record<string, string | null> = {};
          for (const field of ALL_FIELDS) {
            contact[field] = null;
          }
          for (const [csvHeader, dbField] of Object.entries(mapping)) {
            contact[dbField] = row[csvHeader]?.trim() || null;
          }
          contact.uploaded_by = user.id;
          return contact;
        }).filter((c) => c.business_name && c.phone && c.industry);

        if (contacts.length === 0) {
          toast.error("No valid contacts found after filtering.");
          setUploading(false);
          return;
        }

        // Batch insert (chunks of 100)
        let success = 0;
        let errors = 0;
        const chunkSize = 100;

        for (let i = 0; i < contacts.length; i += chunkSize) {
          const chunk = contacts.slice(i, i + chunkSize);
          const { error } = await supabase.from("contacts").insert(chunk as any);
          if (error) {
            errors += chunk.length;
            console.error("Insert error:", error);
          } else {
            success += chunk.length;
          }
        }

        setResult({ success, errors, total: data.length });
        setUploading(false);

        if (success > 0) {
          toast.success(`${success} contacts imported successfully!`);
        }
        if (errors > 0) {
          toast.error(`${errors} contacts failed to import.`);
        }
      },
      error: (error) => {
        toast.error(`Failed to parse CSV: ${error.message}`);
        setUploading(false);
      },
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type === "text/csv" || file.name.endsWith(".csv"))) {
      processCSV(file);
    } else {
      toast.error("Please drop a CSV file.");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processCSV(file);
    e.target.value = "";
  };

  return (
    <AppLayout title="Upload Lists">
      <div className="max-w-2xl mx-auto space-y-6">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="hidden"
        />

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
          {uploading ? (
            <>
              <Loader2 className="h-12 w-12 text-primary mx-auto mb-4 animate-spin" />
              <p className="text-sm font-semibold text-foreground">Importing contacts...</p>
            </>
          ) : result ? (
            <>
              <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-4" />
              <p className="text-sm font-semibold text-foreground">Upload Complete!</p>
              <p className="text-xs text-muted-foreground mt-1">
                {result.success} of {result.total} contacts imported.
                {result.errors > 0 && ` ${result.errors} failed.`}
              </p>
              <Button
                variant="outline"
                className="mt-4 border-border"
                onClick={() => setResult(null)}
              >
                Upload Another
              </Button>
            </>
          ) : (
            <>
              <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm font-semibold text-foreground">Drop your CSV file here</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                or click below to browse
              </p>
              <Button
                variant="outline"
                className="border-border"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Browse Files
              </Button>
            </>
          )}
        </div>

        {parseErrors.length > 0 && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="text-xs font-semibold text-destructive">Import Issues</span>
            </div>
            {parseErrors.map((err, i) => (
              <p key={i} className="text-xs text-muted-foreground font-mono">{err}</p>
            ))}
          </div>
        )}

        <div className="bg-card border border-border rounded-lg p-5">
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
            Required CSV Columns
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              "Business Name", "Phone Number", "Industry", "GMB Link*",
              "Website URL*", "Email Address*", "Contact Person*", "City/State*",
            ].map((col) => (
              <div key={col} className="text-xs font-mono text-muted-foreground bg-secondary px-3 py-2 rounded-md">
                {col}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">* Optional fields. Column headers are auto-mapped.</p>
        </div>
      </div>
    </AppLayout>
  );
}
