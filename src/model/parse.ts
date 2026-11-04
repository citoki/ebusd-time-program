import { MAX_SLOTS } from "./programs.js";
import { toMinutes } from "./time.js";
import type { ProgramSpec, Slot } from "./types.js";

/**
 * Raw values of one slot as ebusd's HA discovery exposes them: one sensor per
 * field (`…_htm`, `…_htm_1`, `…_slottemp`). Values are HA state strings, so
 * `unknown` / `unavailable` / `-` may appear.
 */
export interface RawSlot {
  start: string | undefined;
  end: string | undefined;
  temp?: string | undefined;
}

/** Parse a slot-count sensor state (`"2"`) into 0..MAX_SLOTS, or null if unusable. */
export function parseCount(state: string | undefined): number | null {
  if (state === undefined) return null;
  const n = Number(state);
  return Number.isInteger(n) && n >= 0 && n <= MAX_SLOTS ? n : null;
}

/**
 * Build one day from its slot count and raw slot values. Only the first `count`
 * slots are used: the controller keeps stale data beyond the count, and unused
 * slots read as `00:00–00:00`. Returns null when a needed value is missing
 * (e.g. sensors not yet received), so the caller can show "loading".
 */
export function parseDay(
  count: number | null,
  raw: readonly RawSlot[],
  spec: ProgramSpec,
): Slot[] | null {
  if (count === null) return null;
  const slots: Slot[] = [];
  for (let i = 0; i < count; i++) {
    const r = raw[i];
    if (!r || r.start === undefined || r.end === undefined) return null;
    if (toMinutes(r.start) === null || toMinutes(r.end) === null) return null;
    const slot: Slot = { start: r.start, end: r.end };
    if (spec.temp) {
      const t = parseTemp(r.temp);
      if (t === null) return null;
      slot.temp = t;
    }
    slots.push(slot);
  }
  return slots;
}

function parseTemp(state: string | undefined): number | null {
  if (state === undefined) return null;
  const t = Number.parseFloat(state);
  return Number.isFinite(t) ? t : null;
}
