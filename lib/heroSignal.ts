/**
 * Shared hero signal.
 *
 * The hero's WebGL compositor measures where the clip's sweeping cube-wave
 * currently sits and publishes it here; the headline reads it to decide which
 * of its characters the wave has consumed.
 *
 * A plain module-level value rather than context or state: it updates every
 * frame, and routing that through React would re-render the hero ~60x/second
 * for a number only one rAF loop ever reads.
 *
 * The published value is the wave's TRAVEL, auto-calibrated against the
 * extremes the clip actually reaches: 0 = wave at its leftmost, 1 = its
 * rightmost. Travel rather than raw screen x, because the cube-wave only
 * crosses part of the frame and the composite is shifted right, so raw
 * screen x would never reach the copy on the left.
 */

let sweepX = 1;
let active = false;

/** Called by the compositor each time it re-measures the clip. */
export function publishSweep(x: number): void {
  sweepX = x;
  active = true;
}

/** Wave travel, 0 = leftmost extent, 1 = rightmost. */
export function getSweep(): number {
  return sweepX;
}

/**
 * False until the clip is actually decoding frames. While false the headline
 * must render fully visible, so a missing clip or absent WebGL can never
 * leave the copy permanently erased.
 */
export function isSweepActive(): boolean {
  return active;
}

/** Reset on unmount so a remount does not inherit a stale erased state. */
export function resetSweep(): void {
  sweepX = 1;
  active = false;
}
