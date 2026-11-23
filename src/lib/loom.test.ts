import { describe, expect, it } from "vitest";
import { fmtLoomLength, normaliseLoomUrl } from "./loom";

const ID = "f9970ce0c1d34c6cb70bca4f08e04cc9";
describe("normaliseLoomUrl", () => {
  it.each([
    `https://www.loom.com/share/${ID}`,
    `https://www.loom.com/share/${ID}?sid=abc-123`,
    `https://loom.com/embed/${ID}`,
    `www.loom.com/share/${ID}`,
    `  https://www.loom.com/share/How-to-win-${ID}  `,
  ])("reads %s", (u) => expect(normaliseLoomUrl(u)).toBe(`https://www.loom.com/share/${ID}`));
  it.each(["", "https://youtube.com/watch?v=abc", "https://evil.com/loom.com/share/abc", "https://www.loom.com/looms"])(
    "refuses %s", (u) => expect(normaliseLoomUrl(u)).toBeNull());
});
it("formats length", () => {
  expect(fmtLoomLength(1686)).toBe("28 min");
  expect(fmtLoomLength(null)).toBeNull();
});
