/**
 * Caller ID rotation cadence. One place to change it.
 *
 * The rep's dial counter (dialpad_settings.rotation_dial_count) is bumped by a
 * database trigger on every new outbound dialpad_calls row, so it counts real
 * Dialpad calls whichever path placed them (embedded CTI, server, manual dial,
 * contact page). The dialer then uses pool[floor(count / interval) % size].
 */
export const CALLER_ID_ROTATION_INTERVAL = 40;

/** Which pool slot is live for a given dial count. -1 when the pool is empty. */
export function rotationIndex(
  dialCount: number,
  poolSize: number,
  interval: number = CALLER_ID_ROTATION_INTERVAL,
): number {
  if (poolSize <= 0) return -1;
  const safeCount = Number.isFinite(dialCount) && dialCount > 0 ? Math.floor(dialCount) : 0;
  return Math.floor(safeCount / interval) % poolSize;
}

/** Dials left on the current number before the next one takes over. Null with one number or none. */
export function dialsUntilNextRotation(
  dialCount: number,
  poolSize: number,
  interval: number = CALLER_ID_ROTATION_INTERVAL,
): number | null {
  if (poolSize <= 1) return null;
  const safeCount = Number.isFinite(dialCount) && dialCount > 0 ? Math.floor(dialCount) : 0;
  return interval - (safeCount % interval);
}
