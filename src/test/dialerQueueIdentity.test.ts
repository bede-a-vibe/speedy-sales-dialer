import { describe, expect, it } from "vitest";
import { resolveServedLead, type QueueEntry } from "@/lib/dialerQueueIdentity";

const q = (...ids: string[]): QueueEntry[] => ids.map((id) => ({ id }));

describe("resolveServedLead", () => {
  it("re-seeks when an EARLIER lead is discarded and shifts the buffer", () => {
    // The live bug: rep is serving 'heath' at index 2. A call logged against
    // 'jvk' (index 0) discards it, every entry shifts down one, and index 2 now
    // points at 'heerey' — a different business, whose card would then be
    // dialled using whatever the shifted position held.
    const previousQueue = q("jvk", "acme", "heath", "heerey");
    const nextQueue = q("acme", "heath", "heerey");

    const result = resolveServedLead({
      previousQueue,
      nextQueue,
      currentIndex: 2,
      servedContactId: "heath",
    });

    expect(result.index).toBe(1);
    expect(result.servedContactId).toBe("heath");
    expect(result.reason).toBe("reseeked-after-shift");
    expect(nextQueue[result.index!].id).toBe("heath");
  });

  it("leaves the index alone when the served lead itself is discarded", () => {
    // Logging a call on the current lead should advance to the next one.
    const previousQueue = q("jvk", "heath", "heerey");
    const nextQueue = q("jvk", "heerey");

    const result = resolveServedLead({
      previousQueue,
      nextQueue,
      currentIndex: 1,
      servedContactId: "heath",
    });

    expect(result.index).toBe(1);
    expect(result.servedContactId).toBe("heerey");
    expect(result.reason).toBe("served-lead-removed");
  });

  it("does not fight a deliberate advance", () => {
    // Same array reference: the index changed because the rep moved on, not
    // because the buffer mutated. Re-seeking here would snap them backwards.
    const queue = q("jvk", "heath", "heerey");

    const result = resolveServedLead({
      previousQueue: queue,
      nextQueue: queue,
      currentIndex: 2,
      servedContactId: "heath",
    });

    expect(result.index).toBe(2);
    expect(result.servedContactId).toBe("heerey");
    expect(result.reason).toBe("deliberate-move");
  });

  it("is a no-op when a refill only appends", () => {
    const previousQueue = q("jvk", "heath");
    const nextQueue = q("jvk", "heath", "newlead", "another");

    const result = resolveServedLead({
      previousQueue,
      nextQueue,
      currentIndex: 1,
      servedContactId: "heath",
    });

    expect(result.index).toBe(1);
    expect(result.servedContactId).toBe("heath");
    expect(result.reason).toBe("unchanged");
  });

  it("handles several removals before the served lead", () => {
    const previousQueue = q("a", "b", "c", "heath", "e");
    const nextQueue = q("c", "heath", "e");

    const result = resolveServedLead({
      previousQueue,
      nextQueue,
      currentIndex: 3,
      servedContactId: "heath",
    });

    expect(result.index).toBe(1);
    expect(nextQueue[result.index!].id).toBe("heath");
  });

  it("clears state when nothing is selected", () => {
    const result = resolveServedLead({
      previousQueue: q("a"),
      nextQueue: q("a"),
      currentIndex: null,
      servedContactId: "a",
    });

    expect(result.index).toBeNull();
    expect(result.servedContactId).toBeNull();
  });

  it("adopts the occupant when there is no pinned lead yet", () => {
    const result = resolveServedLead({
      previousQueue: q("a", "b"),
      nextQueue: q("a", "b", "c"),
      currentIndex: 0,
      servedContactId: null,
    });

    expect(result.index).toBe(0);
    expect(result.servedContactId).toBe("a");
  });

  it("survives the served lead being discarded off the end of the buffer", () => {
    const previousQueue = q("a", "heath");
    const nextQueue = q("a");

    const result = resolveServedLead({
      previousQueue,
      nextQueue,
      currentIndex: 1,
      servedContactId: "heath",
    });

    expect(result.index).toBe(1);
    expect(result.servedContactId).toBeNull();
    expect(result.reason).toBe("served-lead-removed");
  });
});
