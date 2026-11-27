/**
 * Dialpad names the other side of a call by their phone number, so every line
 * they speak starts with one. Shown as "Prospect" it reads better, and
 * click-to-call browser extensions have nothing to turn into links: a long
 * transcript carries a hundred numbers.
 */
export function readableTranscript(text: string): string;
export function readableTranscript(text: string | null | undefined): string | null;
export function readableTranscript(text: string | null | undefined): string | null {
  if (text == null) return null;
  return text.replace(/^Dialpad Transcript[ \t]*\n?/, "").replace(/^\+?\d[\d \t()-]{6,}\d[ \t]*:/gm, "Prospect:");
}
