import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

const INPUT_PATH = path.resolve("tmp/Builders_AU.xlsx");
const OUTPUT_PATH = path.resolve("tmp/builders-import.sql");
const UPLOADED_BY = "35a0fecd-d996-414e-9402-ec3d1e08bfd9";
const CHUNK_SIZE = 200;

const STATE_ALIASES: Record<string, string> = {
  "new south wales": "NSW",
  nsw: "NSW",
  victoria: "VIC",
  vic: "VIC",
  queensland: "QLD",
  qld: "QLD",
  "south australia": "SA",
  sa: "SA",
  "western australia": "WA",
  wa: "WA",
  tasmania: "TAS",
  tas: "TAS",
  "northern territory": "NT",
  nt: "NT",
  "australian capital territory": "ACT",
  act: "ACT",
};

function normalize(value: unknown) {
  return String(value ?? "").trim();
}

function sql(value: string | null) {
  if (!value) return "NULL";
  return `'${value.replace(/'/g, "''")}'`;
}

describe("generate builders import sql", () => {
  it("creates SQL from the uploaded spreadsheet", () => {
    const workbook = XLSX.readFile(INPUT_PATH);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: "",
      raw: false,
    });

    const seen = new Set<string>();

    const contacts = rows
      .map((row) => {
        const businessName = normalize(row.name);
        const phone = normalize(row.phone);
        const industry = normalize(row.category) || normalize(row.type) || normalize(row.subtypes) || "Builders";
        const email = normalize(row.email_1) || null;
        const website = normalize(row.site) || null;
        const gmbLink = normalize(row.location_link) || null;
        const city = normalize(row.city) || null;
        const rawState = normalize(row.state).toLowerCase();
        const state = (STATE_ALIASES[rawState] ?? normalize(row.state)) || null;
        const contactPerson = normalize(row.email_1_full_name) || null;

        if (!businessName || !phone || !industry) {
          return null;
        }

        const dedupeKey = `${businessName.toLowerCase()}::${phone}`;
        if (seen.has(dedupeKey)) {
          return null;
        }
        seen.add(dedupeKey);

        return {
          businessName,
          phone,
          industry,
          contactPerson,
          email,
          website,
          gmbLink,
          city,
          state,
        };
      })
      .filter((contact): contact is NonNullable<typeof contact> => Boolean(contact));

    const statements: string[] = [];

    for (let i = 0; i < contacts.length; i += CHUNK_SIZE) {
      const chunk = contacts.slice(i, i + CHUNK_SIZE);
      const values = chunk
        .map(
          (contact) => `(${sql(contact.businessName)}, ${sql(contact.contactPerson)}, ${sql(contact.phone)}, ${sql(contact.email)}, ${sql(contact.website)}, ${sql(contact.gmbLink)}, ${sql(contact.industry)}, ${sql(contact.city)}, ${sql(contact.state)}, ${sql(UPLOADED_BY)})`,
        )
        .join(",\n");

      statements.push(`INSERT INTO public.contacts (business_name, contact_person, phone, email, website, gmb_link, industry, city, state, uploaded_by) VALUES\n${values};`);
    }

    fs.writeFileSync(OUTPUT_PATH, statements.join("\n\n"));

    expect(contacts.length).toBeGreaterThan(0);
  });
});
