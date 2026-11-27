import { describe, expect, it } from "vitest";
import { readableTranscript } from "@/lib/transcript";

describe("readableTranscript", () => {
  it("names the prospect instead of showing their number", () => {
    expect(readableTranscript("Dialpad Transcript\nBen: Hi mate.\n+61 400 000 000: Yeah?\n0400000000: Who's this?")).toBe(
      "Ben: Hi mate.\nProspect: Yeah?\nProspect: Who's this?",
    );
  });
  it("leaves numbers inside a sentence and times alone", () => {
    const text = "Ben: Is it +61 400 000 000: right?\n10:30 works for me";
    expect(readableTranscript(text)).toBe(text);
  });
  it("passes nothing through", () => expect(readableTranscript(null)).toBeNull());
});
