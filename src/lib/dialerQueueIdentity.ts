/**
 * Keeps the lead a rep is serving pinned to a contact ID rather than to a
 * position in the queue buffer.
 *
 * The rolling dialer queue removes contacts from the MIDDLE of its buffer:
 *
 *   contactsRef.current = contactsRef.current.filter((c) => c.id !== contactId)
 *
 * Every element after the removed one shifts down by one. With the served lead
 * tracked as a bare array index, the rep silently starts looking at — and
 * dialling — a different person than the one served a moment earlier. That is
 * how one business's decision-maker mobile was dialled from two unrelated leads.
 *
 * Appends are safe (the buffer only ever pushes onto the end); removals are not.
 */

export interface QueueEntry {
  id: string;
}

export interface ServedLead {
  /** The index the session should now use. */
  index: number | null;
  /** The contact ID being served at that index. */
  servedContactId: string | null;
  /**
   * Why the result came out the way it did. Useful in tests and when reasoning
   * about a live session; the hook itself only needs index + servedContactId.
   */
  reason:
    | "no-selection"
    | "deliberate-move"
    | "unchanged"
    | "reseeked-after-shift"
    | "served-lead-removed";
}

export function resolveServedLead({
  previousQueue,
  nextQueue,
  currentIndex,
  servedContactId,
}: {
  previousQueue: QueueEntry[];
  nextQueue: QueueEntry[];
  currentIndex: number | null;
  servedContactId: string | null;
}): ServedLead {
  if (currentIndex === null) {
    return { index: null, servedContactId: null, reason: "no-selection" };
  }

  const occupantId = nextQueue[currentIndex]?.id ?? null;

  // Identity comparison, not deep equality: the buffer is replaced wholesale on
  // every mutation, so a new array reference is exactly the signal that
  // something was added or removed.
  if (previousQueue === nextQueue) {
    // The index moved on its own (advance / skip / jump). Whoever it points at
    // now is deliberately the lead being served.
    return { index: currentIndex, servedContactId: occupantId, reason: "deliberate-move" };
  }

  if (!servedContactId || occupantId === servedContactId) {
    return { index: currentIndex, servedContactId: occupantId, reason: "unchanged" };
  }

  const seekIndex = nextQueue.findIndex((contact) => contact.id === servedContactId);

  if (seekIndex === -1) {
    // The served lead is the one that was discarded. The index now lands on the
    // lead that followed it, which is the intended behaviour after logging.
    return { index: currentIndex, servedContactId: occupantId, reason: "served-lead-removed" };
  }

  // Something else was removed and shifted the buffer underneath us.
  return { index: seekIndex, servedContactId, reason: "reseeked-after-shift" };
}
