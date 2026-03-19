import { useRef, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  isSupportedContactUploadFile,
  parseContactUploadFile,
  prepareContactImport,
} from "@/lib/contactImport";
import { validateContactRows } from "@/lib/contactValidation";

export default function UploadPage() {
  const { user } = useAuth();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ success: number; errors: number; total: number; metadataNotes: number } | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    if (!user) {
      toast.error("You must be logged in to upload.");
      return;
    }

    setUploading(true);
    setResult(null);
    setParseErrors([]);

    try {
      const { rows, parseErrors: fileParseErrors } = await parseContactUploadFile(file);

      if (fileParseErrors.length > 0) {
        setParseErrors(fileParseErrors);
      }

      if (rows.length === 0) {
        toast.error("No data found in file.");
        return;
      }

      const { contacts, contactNotes, headers, missingRequired } = prepareContactImport(rows, user.id);

      if (missingRequired.length > 0) {
        toast.error(`Missing required columns: ${missingRequired.join(", ")}`);
        setParseErrors([
          `Could not find columns for: ${missingRequired.join(", ")}`,
          `Found columns: ${headers.join(", ")}`,
        ]);
        return;
      }

      if (contacts.length === 0) {
        toast.error("No valid contacts found after filtering.");
        return;
      }

      // Validate rows with Zod before inserting
      const validation = validateContactRows(contacts);
      if (validation.invalidCount > 0) {
        const firstErrors = validation.errors.slice(0, 5);
        setParseErrors((prev) => [
          ...prev,
          `${validation.invalidCount} row(s) failed validation:`,
          ...firstErrors.map((e) => `Row ${e.row}: ${e.field} — ${e.message}`),
          ...(validation.errors.length > 5 ? [`...and ${validation.errors.length - 5} more`] : []),
        ]);
        toast.warning(`${validation.invalidCount} rows have validation issues — uploading ${validation.validCount} valid rows.`);
      }

      const notesByContactId = new Map(contactNotes.map((note) => [note.contact_id, note]));
      let success = 0;
      let errors = 0;
      let metadataNotes = 0;
      let metadataNoteSaveFailed = false;
      const chunkSize = 100;

      for (let i = 0; i < contacts.length; i += chunkSize) {
        const chunk = contacts.slice(i, i + chunkSize);
        const { error } = await supabase.from("contacts").insert(chunk);

        if (error) {
          errors += chunk.length;
          console.error("Insert error:", error);
          continue;
        }

        success += chunk.length;

        const chunkNotes = chunk
          .map((contact) => contact.id)
          .flatMap((contactId) => {
            const note = contactId ? notesByContactId.get(contactId) : undefined;
            return note ? [note] : [];
          });

        if (chunkNotes.length === 0) {
          continue;
        }

        const { error: notesError } = await supabase.from("contact_notes").insert(chunkNotes);

        if (notesError) {
          metadataNoteSaveFailed = true;
          console.error("Contact note insert error:", notesError);
          continue;
        }

        metadataNotes += chunkNotes.length;
      }

      setResult({ success, errors, total: rows.length, metadataNotes });

      if (success > 0) {
        toast.success(`${success} contacts imported successfully!`);
      }
      if (metadataNoteSaveFailed) {
        toast.error("Contacts imported, but some builder metadata notes could not be saved.");
      }
      if (errors > 0) {
        toast.error(`${errors} contacts failed to import.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import file.";
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];

    if (file && isSupportedContactUploadFile(file)) {
      processFile(file);
    } else {
      toast.error("Please drop a CSV, XLSX, or XLS file.");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  };

  return (
    <AppLayout title="Upload Lists">
      <div className="max-w-2xl mx-auto space-y-6">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleFileSelect}
          className="hidden"
        />

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
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
                {result.metadataNotes > 0 && ` ${result.metadataNotes} metadata notes added.`}
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
              <p className="text-sm font-semibold text-foreground">Drop your CSV or Excel file here</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Supports .csv, .xlsx, and .xls uploads
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
            Supported Import Columns
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              "Business Name / Name",
              "Phone Number",
              "Industry / Category / Type",
              "Website / Site*",
              "GMB Link / Location Link*",
              "Email / Email 1*",
              "Contact Person*",
              "City / State*",
              "Subtype*",
              "Full Address*",
              "Rating*",
            ].map((col) => (
              <div key={col} className="text-xs font-mono text-muted-foreground bg-secondary px-3 py-2 rounded-md">
                {col}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            * Optional fields. Headers are auto-mapped for CSV and Excel files.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
