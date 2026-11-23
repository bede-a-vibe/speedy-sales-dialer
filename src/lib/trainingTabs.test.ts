import { describe, expect, it } from "vitest";
import { legacyClassroomSearch, trainingTabFor } from "./trainingTabs";

const tab = (q: string) => trainingTabFor(new URLSearchParams(q));

describe("trainingTabFor", () => {
  it.each([
    ["", "reviews"],
    ["tab=library", "library"],
    ["tab=nonsense", "reviews"],
    ["course=open-the-call&lesson=abc", "classroom"],
    ["loom=r1", "reviews"],
    ["module=coach", "practice"],
    ["module=real-calls", "library"],
    ["module=objections", "classroom"],
    ["drill=busy", "practice"],
    ["tab=classroom&module=coach", "classroom"],
  ])("%s -> %s", (q, want) => expect(tab(q)).toBe(want));
});

describe("legacyClassroomSearch", () => {
  it("lands a bare /classroom on the Classroom tab", () => expect(legacyClassroomSearch("")).toBe("?tab=classroom"));
  it("keeps the lesson", () => expect(legacyClassroomSearch("?course=a&lesson=b")).toBe("?course=a&lesson=b&tab=classroom"));
  it("keeps a drill", () => expect(legacyClassroomSearch("?drill=busy")).toBe("?drill=busy&tab=practice"));
});
