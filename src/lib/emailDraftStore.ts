import {
  emailDraftSuggestionSchema,
  type EmailDraftSuggestion,
} from "@/lib/emailDraftSuggestions";

const STORAGE_KEY = "emailDraftSuggestions:v1";

type StoredDraftMap = Record<string, EmailDraftSuggestion>;

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readDraftMap(): StoredDraftMap {
  if (!canUseStorage()) return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.entries(parsed).reduce<StoredDraftMap>((acc, [contactId, value]) => {
      const result = emailDraftSuggestionSchema.safeParse(value);
      if (result.success) {
        acc[contactId] = result.data;
      }
      return acc;
    }, {});
  } catch {
    return {};
  }
}

function writeDraftMap(drafts: StoredDraftMap) {
  if (!canUseStorage()) return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // Ignore storage quota or browser privacy failures.
  }
}

export function loadStoredEmailDraftSuggestion(contactId?: string | null) {
  if (!contactId) return null;
  const drafts = readDraftMap();
  return drafts[contactId] ?? null;
}

export function loadAllStoredEmailDraftSuggestions() {
  return readDraftMap();
}

export function saveStoredEmailDraftSuggestion(suggestion: EmailDraftSuggestion) {
  const drafts = readDraftMap();
  drafts[suggestion.context.contactId] = suggestion;
  writeDraftMap(drafts);
}

export function clearStoredEmailDraftSuggestion(contactId?: string | null) {
  if (!contactId) return;
  const drafts = readDraftMap();
  if (!drafts[contactId]) return;
  delete drafts[contactId];
  writeDraftMap(drafts);
}
