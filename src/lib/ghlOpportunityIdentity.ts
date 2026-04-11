export function extractGhlOpportunityId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;
  const directId = record.id;
  if (typeof directId === "string" && directId.trim()) return directId;

  const opportunity = record.opportunity;
  if (opportunity && typeof opportunity === "object") {
    const nestedId = (opportunity as Record<string, unknown>).id;
    if (typeof nestedId === "string" && nestedId.trim()) return nestedId;
  }

  const data = record.data;
  if (data && typeof data === "object") {
    const nestedId = (data as Record<string, unknown>).id;
    if (typeof nestedId === "string" && nestedId.trim()) return nestedId;
  }

  return null;
}
