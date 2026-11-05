import { roundToStep, toMinutes } from "./time.js";
import { DAYS, type Day, type ProgramSpec, type Slot, type Week } from "./types.js";

// ---------- day selection presets ----------

export type Preset = "all" | "weekdays" | "weekend";

export const PRESETS: Record<Preset, readonly Day[]> = {
  all: DAYS,
  weekdays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  weekend: ["saturday", "sunday"],
};

/** Selection in Monday-first order without duplicates. */
export function orderDays(days: Iterable<Day>): Day[] {
  const set = new Set(days);
  return DAYS.filter((d) => set.has(d));
}

/** The preset that exactly matches the selection, or null for a custom selection. */
export function presetOf(days: readonly Day[]): Preset | null {
  const sel = orderDays(days);
  for (const [name, preset] of Object.entries(PRESETS) as [Preset, readonly Day[]][]) {
    if (preset.length === sel.length && preset.every((d, i) => sel[i] === d)) return name;
  }
  return null;
}

export function toggleDay(days: readonly Day[], day: Day): Day[] {
  return days.includes(day) ? orderDays(days.filter((d) => d !== day)) : orderDays([...days, day]);
}

// ---------- slot normalisation & comparison ----------

/**
 * Canonical form of a day for comparing and writing: sorted by start, and
 * temperature removed for programs without one / rounded to the program step.
 */
export function normalizeSlots(slots: readonly Slot[], spec: ProgramSpec): Slot[] {
  return [...slots]
    .map((s): Slot => {
      if (!spec.temp) return { start: s.start, end: s.end };
      return s.temp === undefined
        ? { start: s.start, end: s.end }
        : { start: s.start, end: s.end, temp: roundToStep(s.temp, spec.temp.step) };
    })
    .sort((a, b) => (toMinutes(a.start) ?? 0) - (toMinutes(b.start) ?? 0));
}

export function sameSlots(a: readonly Slot[], b: readonly Slot[], spec: ProgramSpec): boolean {
  const na = normalizeSlots(a, spec);
  const nb = normalizeSlots(b, spec);
  return (
    na.length === nb.length &&
    na.every((s, i) => {
      const o = nb[i]!;
      return s.start === o.start && s.end === o.end && s.temp === o.temp;
    })
  );
}

// ---------- multi-day editing ----------

export interface SelectionDraft {
  /** True when all selected days currently have the same program. */
  identical: boolean;
  /** Day the draft was taken from (null when nothing is selected). */
  source: Day | null;
  /** Initial draft slots (a copy, safe to edit). */
  slots: Slot[];
}

/**
 * Initial editor content for a day selection. When the selected days differ,
 * the draft is taken from `source` if it is part of the selection, otherwise
 * from the first selected day.
 */
export function draftForSelection(
  week: Week,
  selected: readonly Day[],
  spec: ProgramSpec,
  source?: Day,
): SelectionDraft {
  const days = orderDays(selected);
  const first = days[0];
  if (first === undefined) return { identical: true, source: null, slots: [] };
  const from = source !== undefined && days.includes(source) ? source : first;
  const base = week[from];
  const identical = days.every((d) => sameSlots(week[d], base, spec));
  return { identical, source: from, slots: base.map((s) => ({ ...s })) };
}

export interface WritePlan {
  /** Days that must be written, Monday first. */
  write: Day[];
  /** Selected days that already have exactly the draft program (skipped). */
  unchanged: Day[];
  /** The normalised slots that will be written to every day in `write`. */
  slots: Slot[];
}

export function planWrite(
  week: Week,
  selected: readonly Day[],
  draft: readonly Slot[],
  spec: ProgramSpec,
): WritePlan {
  const write: Day[] = [];
  const unchanged: Day[] = [];
  for (const day of orderDays(selected)) {
    (sameSlots(week[day], draft, spec) ? unchanged : write).push(day);
  }
  return { write, unchanged, slots: normalizeSlots(draft, spec) };
}

export interface SlotDelta {
  /** Slots added (> 0) or removed (< 0) compared to the day's current program. Never 0. */
  delta: number;
  days: Day[];
}

/**
 * How many slots the write adds or removes, grouped by day. Days whose slot
 * count does not change are left out, so an empty result means "same count".
 */
export function slotDeltas(week: Week, plan: WritePlan): SlotDelta[] {
  const groups = new Map<number, Day[]>();
  for (const day of plan.write) {
    const delta = plan.slots.length - week[day].length;
    if (delta !== 0) groups.set(delta, [...(groups.get(delta) ?? []), day]);
  }
  return [...groups].sort((a, b) => b[0] - a[0]).map(([delta, days]) => ({ delta, days }));
}

/** Week after applying a draft to some days (used for preview and verification). */
export function applyDraft(week: Week, days: readonly Day[], draft: readonly Slot[], spec: ProgramSpec): Week {
  const next = { ...week };
  const slots = normalizeSlots(draft, spec);
  for (const d of days) next[d] = slots.map((s) => ({ ...s }));
  return next;
}

export function emptyWeek(): Week {
  return Object.fromEntries(DAYS.map((d) => [d, []])) as unknown as Week;
}
