import { MAX_SLOTS, TIME_STEP } from "./programs.js";
import { perSlotTemp } from "./week.js";
import { fromMinutes, isOnGrid, MINUTES_PER_DAY, roundToStep, toMinutes } from "./time.js";
import type { ProgramSpec, Slot, TempRange } from "./types.js";

/** Pure editing helpers for the slot editor (no DOM). */

export type TimeField = "start" | "end";

/** Allowed minute range for a time field: start 00:00–23:50, end 00:10–24:00. */
export function timeBounds(field: TimeField): { min: number; max: number } {
  return field === "start"
    ? { min: 0, max: MINUTES_PER_DAY - TIME_STEP }
    : { min: TIME_STEP, max: MINUTES_PER_DAY };
}

export function clampTime(minutes: number, field: TimeField): number {
  const { min, max } = timeBounds(field);
  const snapped = Math.round(minutes / TIME_STEP) * TIME_STEP;
  return Math.min(max, Math.max(min, snapped));
}

/**
 * The time the time sheet opens with: the stored time as it is, also off the
 * 10-minute grid (e.g. 17:22 written directly via eBUS), only kept within the
 * field's range. Stepping it then snaps to the grid.
 */
export function openTime(minutes: number, field: TimeField): number {
  const { min, max } = timeBounds(field);
  return Math.min(max, Math.max(min, minutes));
}

/** The next grid time in direction `dir`: 17:22 -> 17:30 (up) or 17:20 (down). */
function nextOnGrid(minutes: number, dir: 1 | -1): number {
  const below = minutes - (minutes % TIME_STEP);
  return dir > 0 ? below + TIME_STEP : below;
}

/**
 * Add `delta` minutes (carrying into hours), clamped to the field's range.
 * A time off the grid first moves to the next grid time in that direction.
 */
export function stepTime(minutes: number, delta: number, field: TimeField): number {
  if (!isOnGrid(minutes) && delta !== 0) return clampTime(nextOnGrid(minutes, delta > 0 ? 1 : -1), field);
  return clampTime(minutes + delta, field);
}

/**
 * Step the hour or the minute part separately (time-sheet columns).
 * Minutes wrap within the hour (…, 50, 00, …); hours clamp. 24 forces :00.
 */
export function stepPart(minutes: number, part: "hour" | "minute", dir: 1 | -1, field: TimeField): number {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (part === "hour") {
    const nh = h + dir;
    return clampTime(nh * 60 + (nh >= 24 ? 0 : m), field);
  }
  if (h === 24) return minutes; // 24:00 has no minutes to change
  const nm = (isOnGrid(m) ? m + dir * TIME_STEP + 60 : nextOnGrid(m, dir)) % 60;
  return clampTime(h * 60 + nm, field);
}

/** Initial temperature for a new slot when there is no previous slot to copy. */
export function defaultTemp(spec: ProgramSpec): number | undefined {
  if (!spec.temp) return undefined;
  const preferred = spec.defaultTemp ?? (spec.temp.min + spec.temp.max) / 2;
  return clampTemp(preferred, spec.temp);
}

export function clampTemp(t: number, range: TempRange): number {
  return Math.min(range.max, Math.max(range.min, roundToStep(t, range.step)));
}

export function stepTemp(t: number, dir: 1 | -1, range: TempRange): number {
  return clampTemp(t + dir * range.step, range);
}

/** Slots sorted by start (invalid times last); does not round or drop anything. */
export function sortSlots(slots: readonly Slot[]): Slot[] {
  const key = (s: Slot) => toMinutes(s.start) ?? Number.MAX_SAFE_INTEGER;
  return [...slots].sort((a, b) => key(a) - key(b));
}

export function updateSlot(slots: readonly Slot[], index: number, patch: Partial<Slot>): Slot[] {
  return sortSlots(slots.map((s, i) => (i === index ? { ...s, ...patch } : s)));
}

export function removeSlot(slots: readonly Slot[], index: number): Slot[] {
  return slots.filter((_, i) => i !== index);
}

/**
 * Slot `index` merged with the next one: from the earlier start to the later
 * end, a gap between them filled; the first slot's temperature (the second's
 * if the first has none). Null when there is no next slot or a time is invalid.
 */
export function mergedSlot(slots: readonly Slot[], index: number): Slot | null {
  const a = slots[index];
  const b = slots[index + 1];
  if (!a || !b) return null;
  const [as, ae, bs, be] = [a.start, a.end, b.start, b.end].map(toMinutes);
  if (as == null || ae == null || bs == null || be == null) return null;
  const merged: Slot = { ...a, start: as <= bs ? a.start : b.start, end: ae >= be ? a.end : b.end };
  if (merged.temp === undefined && b.temp !== undefined) merged.temp = b.temp;
  return merged;
}

/**
 * Replace slot `index` and the next one by `merged` (default: mergedSlot()).
 * Unsorted, so the merged slot keeps `index`. Null when they cannot be merged.
 */
export function mergeSlots(slots: readonly Slot[], index: number, merged = mergedSlot(slots, index)): Slot[] | null {
  if (!merged || index + 1 >= slots.length) return null;
  return slots.flatMap((s, i) => (i === index ? [merged] : i === index + 1 ? [] : [s]));
}

/**
 * Whether merging needs a temperature choice: per-slot temperatures that
 * differ between the two slots.
 */
export function mergeNeedsTemp(slots: readonly Slot[], index: number, spec: ProgramSpec): boolean {
  const a = slots[index]?.temp;
  const b = slots[index + 1]?.temp;
  return perSlotTemp(spec) && a !== undefined && b !== undefined && a !== b;
}

const NEW_SLOT_MINUTES = 60;
const ceilToGrid = (minutes: number) => Math.ceil(minutes / TIME_STEP) * TIME_STEP;
/** Gap kept after the last slot so a new slot does not touch it. */
const NEW_SLOT_GAP = 60;

/**
 * Proposal for "Add time slot": one hour, one hour after the last slot; if
 * that doesn't fit, the first free gap of the day. The temperature is copied
 * from the last slot. Returns null when the day is full (3 slots or no gap).
 */
export function suggestSlot(slots: readonly Slot[], spec: ProgramSpec): Slot | null {
  if (slots.length >= MAX_SLOTS) return null;
  const ranges = sortSlots(slots)
    .map((s) => ({ start: toMinutes(s.start), end: toMinutes(s.end) }))
    .filter((r): r is { start: number; end: number } => r.start !== null && r.end !== null && r.end > r.start);
  const last = ranges.at(-1);
  const temp = [...slots].reverse().find((s) => s.temp !== undefined)?.temp ?? defaultTemp(spec);
  const make = (start: number, end: number): Slot => {
    const slot: Slot = { start: fromMinutes(start), end: fromMinutes(end) };
    if (spec.temp && temp !== undefined) slot.temp = clampTemp(temp, spec.temp);
    return slot;
  };

  if (!last) return make(6 * 60, 7 * 60);

  // new slots start on the grid, also after a slot that ends off it (e.g. 19:58)
  const after = ceilToGrid(last.end + NEW_SLOT_GAP);
  if (after + TIME_STEP <= MINUTES_PER_DAY) {
    return make(after, Math.min(after + NEW_SLOT_MINUTES, MINUTES_PER_DAY));
  }

  // first free gap, from midnight
  let cursor = 0;
  for (const r of [...ranges, { start: MINUTES_PER_DAY, end: MINUTES_PER_DAY }]) {
    if (r.start - cursor >= TIME_STEP) return make(cursor, Math.min(cursor + NEW_SLOT_MINUTES, r.start - (r.start % TIME_STEP)));
    cursor = Math.max(cursor, ceilToGrid(r.end));
  }
  return null;
}
