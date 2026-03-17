import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { TablesInsert } from "@/integrations/supabase/types";

export interface ImportRow {
  [key: string]: string;
}

export interface ParsedContactUploadFile {
  rows: ImportRow[];
  parseErrors: string[];
}

export interface PreparedContactImport {
  contacts: ContactImportInsert[];
  contactNotes: ContactNoteImportInsert[];
  headers: string[];
  missingRequired: string[];
}

type ContactImportInsert = Pick<
  TablesInsert<"contacts">,
  | "id"
  | "business_name"
  | "phone"
  | "industry"
  | "contact_person"
  | "email"
  | "website"
  | "gmb_link"
  | "city"
  | "state"
  | "uploaded_by"
>;

type ContactNoteImportInsert = Pick<
  TablesInsert<"contact_notes">,
  "contact_id" | "content" | "created_by" | "source"
>;

const REQUIRED_FIELDS = ["business_name", "phone", "industry"] as const;
const OPTIONAL_FIELDS = ["contact_person", "email", "website", "gmb_link", "city", "state"] as const;
const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS] as const;
const EXTRA_NOTE_FIELDS = ["subtype", "full_address", "rating"] as const;

type ContactField = (typeof ALL_FIELDS)[number];
type ExtraNoteField = (typeof EXTRA_NOTE_FIELDS)[number];
type MappableField = ContactField | ExtraNoteField;

const FIELD_ALIASES: Record<MappableField, string[]> = {
  business_name: ["business name", "business", "company", "company name", "name"],
  phone: ["phone", "phone number", "telephone", "tel", "mobile"],
  industry: ["industry", "category", "type", "sector", "subtypes"],
  contact_person: ["contact person", "contact", "contact name", "person", "owner", "email 1 full name"],
  email: ["email", "email address", "e-mail", "email 1", "email_1"],
  website: ["website", "website url", "url", "web", "site"],
  gmb_link: ["gmb link", "gmb", "google my business", "google business", "gmb url", "google maps", "location link", "location_link"],
  city: ["city", "town"],
  state: ["state", "province", "region"],
  subtype: ["subtype", "sub type"],
  full_address: ["full address", "full_address", "address", "street address"],
  rating: ["rating", "review rating", "stars", "star rating"],
};

const SUPPORTED_EXTENSIONS = [".csv", ".xlsx", ".xls"];
const AUSTRALIAN_STATE_ALIASES: Record<string, string> = {
  nsw: "NSW",
  "new south wales": "NSW",
  vic: "VIC",
  victoria: "VIC",
  qld: "QLD",
  queensland: "QLD",
  sa: "SA",
  "south australia": "SA",
  wa: "WA",
  "western australia": "WA",
  tas: "TAS",
  tasmania: "TAS",
  nt: "NT",
  "northern territory": "NT",
  act: "ACT",
  "australian capital territory": "ACT",
};

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function normalizeCellValue(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function mapColumn(header: string): MappableField | null {
  const normalized = normalizeText(header);

  for (const field of [...ALL_FIELDS, ...EXTRA_NOTE_FIELDS] as const) {
    if (normalized === field) {
      return field;
    }

    if (FIELD_ALIASES[field].includes(normalized)) {
      return field;
    }
  }

  return null;
}

function normalizeState(value: string | null) {
  if (!value) return null;
  const normalized = normalizeText(value);
  return AUSTRALIAN_STATE_ALIASES[normalized] ?? value.trim();
}

function isSpreadsheetFile(file: File) {
  const lowerName = file.name.toLowerCase();
  return lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls");
}

export function isSupportedContactUploadFile(file: File) {
  const lowerName = file.name.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

function parseCsvFile(file: File): Promise<ParsedContactUploadFile> {
  return new Promise((resolve, reject) => {
    Papa.parse<ImportRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        resolve({
          rows: results.data,
          parseErrors: results.errors.map((error) => `Row ${error.row}: ${error.message}`),
        });
      },
      error: (error) => reject(error),
    });
  });
}

function parseSpreadsheetFile(file: File): Promise<ParsedContactUploadFile> {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      return { rows: [], parseErrors: [] };
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: "",
      raw: false,
    });

    return {
      rows: rows.map((row) =>
        Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeCellValue(value)])),
      ),
      parseErrors: [],
    };
  });
}

export async function parseContactUploadFile(file: File): Promise<ParsedContactUploadFile> {
  if (!isSupportedContactUploadFile(file)) {
    throw new Error("Please upload a CSV, XLSX, or XLS file.");
  }

  return isSpreadsheetFile(file) ? parseSpreadsheetFile(file) : parseCsvFile(file);
}

function buildImportedMetadataNote(extraFields: Record<ExtraNoteField, string | null>) {
  const labeledValues = [
    ["Subtype", extraFields.subtype],
    ["Full address", extraFields.full_address],
    ["Rating", extraFields.rating],
  ].filter(([, value]) => value);

  if (labeledValues.length === 0) {
    return null;
  }

  return ["Imported builder metadata", ...labeledValues.map(([label, value]) => `${label}: ${value}`)].join("\n");
}

export function prepareContactImport(rows: ImportRow[], userId: string): PreparedContactImport {
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  const mapping: Partial<Record<string, MappableField>> = {};

  for (const header of headers) {
    const field = mapColumn(header);
    if (field) {
      mapping[header] = field;
    }
  }

  const mappedFields = Object.values(mapping);
  const missingRequired = REQUIRED_FIELDS.filter((field) => !mappedFields.includes(field));

  if (missingRequired.length > 0) {
    return { contacts: [], contactNotes: [], headers, missingRequired };
  }

  const preparedRows = rows
    .map((row) => {
      const contact: Record<ContactField, string | null> = {
        business_name: null,
        phone: null,
        industry: null,
        contact_person: null,
        email: null,
        website: null,
        gmb_link: null,
        city: null,
        state: null,
      };
      const extraFields: Record<ExtraNoteField, string | null> = {
        subtype: null,
        full_address: null,
        rating: null,
      };

      for (const [header, dbField] of Object.entries(mapping)) {
        if (!dbField) continue;
        const value = normalizeCellValue(row[header]) || null;

        if ((ALL_FIELDS as readonly string[]).includes(dbField)) {
          contact[dbField as ContactField] = value;
        } else {
          extraFields[dbField as ExtraNoteField] = value;
        }
      }

      if (!contact.business_name || !contact.phone || !contact.industry) {
        return null;
      }

      const contactId = crypto.randomUUID();
      const noteContent = buildImportedMetadataNote(extraFields);

      return {
        contact: {
          id: contactId,
          ...contact,
          state: normalizeState(contact.state),
          uploaded_by: userId,
        } as ContactImportInsert,
        contactNote: noteContent
          ? ({
              contact_id: contactId,
              content: noteContent,
              created_by: userId,
              source: "manual",
            } as ContactNoteImportInsert)
          : null,
      };
    })
    .filter((row): row is { contact: ContactImportInsert; contactNote: ContactNoteImportInsert | null } => row !== null);

  return {
    contacts: preparedRows.map((row) => row.contact),
    contactNotes: preparedRows.flatMap((row) => (row.contactNote ? [row.contactNote] : [])),
    headers,
    missingRequired: [],
  };
}
