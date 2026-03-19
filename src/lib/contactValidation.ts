import { z } from "zod";

/** Minimum viable phone: at least 6 digits after stripping non-digits */
const phoneSchema = z
  .string()
  .min(1, "Phone is required")
  .refine(
    (val) => val.replace(/\D/g, "").length >= 6,
    "Phone must contain at least 6 digits",
  );

export const contactRowSchema = z.object({
  business_name: z.string().min(1, "Business name is required").max(500),
  phone: phoneSchema,
  industry: z.string().min(1, "Industry is required").max(200),
  contact_person: z.string().max(300).nullable().optional(),
  email: z
    .string()
    .email("Invalid email")
    .max(320)
    .nullable()
    .optional()
    .or(z.literal(""))
    .or(z.null()),
  website: z.string().max(2000).nullable().optional(),
  gmb_link: z.string().max(2000).nullable().optional(),
  city: z.string().max(200).nullable().optional(),
  state: z.string().max(100).nullable().optional(),
});

export type ContactRowInput = z.infer<typeof contactRowSchema>;

export interface ContactValidationResult {
  validCount: number;
  invalidCount: number;
  errors: Array<{ row: number; field: string; message: string }>;
}

/**
 * Validates an array of contact rows and returns detailed per-row errors.
 * Does NOT filter rows — caller decides whether to skip or abort.
 */
export function validateContactRows(
  rows: Array<Record<string, unknown>>,
): ContactValidationResult {
  const errors: ContactValidationResult["errors"] = [];
  let validCount = 0;
  let invalidCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const result = contactRowSchema.safeParse(rows[i]);
    if (result.success) {
      validCount++;
    } else {
      invalidCount++;
      for (const issue of result.error.issues) {
        errors.push({
          row: i + 1, // 1-indexed for display
          field: issue.path.join(".") || "unknown",
          message: issue.message,
        });
      }
    }
  }

  return { validCount, invalidCount, errors };
}
