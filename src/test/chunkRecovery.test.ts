import { describe, expect, it, vi } from "vitest";
import { recoverChunkLoad } from "@/lib/chunkRecovery";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

describe("stale page recovery", () => {
  it("reloads once when a deployment's page module is unavailable", () => {
    const storage = createStorage();
    const reload = vi.fn();
    const error = new Error("Failed to fetch dynamically imported module: /assets/ClientsPage-old.js");
    expect(recoverChunkLoad(error, storage, reload)).toBe(true);
    expect(recoverChunkLoad(error, storage, reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload for application or data errors", () => {
    const reload = vi.fn();
    expect(recoverChunkLoad(new Error("Failed to fetch client deals"), createStorage(), reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not automatically reload if the loop guard cannot be saved", () => {
    const reload = vi.fn();
    const storage = { getItem: () => null, setItem: () => { throw new Error("Storage unavailable"); } };
    expect(recoverChunkLoad(new Error("Importing a module script failed"), storage, reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});