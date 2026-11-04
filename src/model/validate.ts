import { MAX_SLOTS } from "./programs.js";
import { isOnGrid, isOnStep, roundToStep, toMinutes } from "./time.js";
import type { Day, ProgramSpec, Slot } from "./types.js";

export type IssueLevel = "error" | "warning" | "info";

export type IssueCode =
  | "invalid_time" // not HH:MM / out of 00:00..24:00
  | "off_grid" // not on the 10-minute grid
  | "start_24" // 24:00 is only allowed as end
  | "end_before_start"
  | "overlap"
  | "too_many_slots"
  | "temp_missing"
  | "temp_range"
  | "temp_rounded" // stored value not on the step grid; will be rounded on save
  | "temp_low"
  | "mergeable" // adjacent slots with the same temperature
  | "no_days";

export interface Issue {
  level: IssueLevel;
  code: IssueCode;
  /** Index into the slot array that was validated (absent for day-level issues). */
  slot?: number;
  field?: "start" | "end" | "temp";
  params?: Record<string, string | number>;
}

export const hasErrors = (issues: readonly Issue[]): boolean =>
  issues.some((i) => i.level === "error");

/**
 * Validate the slots of one day for a program. Slots may be in any order;
 * overlap is detected on start-sorted order and reported on the later slot.
 * Indexes in the result refer to the input array.
 */
export function validateDay(slots: readonly Slot[], spec: ProgramSpec): Issue[] {
  const issues: Issue[] = [];

  if (slots.length > MAX_SLOTS) {
    issues.push({ level: "error", code: "too_many_slots", params: { max: MAX_SLOTS } });
  }

  const parsed: { idx: number; start: number; end: number; temp: number | undefined }[] = [];

  slots.forEach((slot, idx) => {
    const start = checkTime(slot.start, "start", idx, issues);
    const end = checkTime(slot.end, "end", idx, issues);
    if (start === 24 * 60) {
      issues.push({ level: "error", code: "start_24", slot: idx, field: "start" });
    }
    if (start !== null && end !== null) {
      if (end <= start) {
        issues.push({ level: "error", code: "end_before_start", slot: idx, field: "end" });
      } else {
        parsed.push({ idx, start, end, temp: slot.temp });
      }
    }
    checkTemp(slot, idx, spec, issues);
  });

  const sorted = [...parsed].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (cur.start < prev.end) {
      issues.push({
        level: "error",
        code: "overlap",
        slot: cur.idx,
        field: "start",
        params: {
          other: prev.idx + 1,
          range: `${slots[prev.idx]!.start}–${slots[prev.idx]!.end}`,
        },
      });
    } else if (
      cur.start === prev.end &&
      (!spec.temp || (cur.temp !== undefined && cur.temp === prev.temp))
    ) {
      issues.push({
        level: "info",
        code: "mergeable",
        slot: cur.idx,
        params: { a: prev.idx + 1, b: cur.idx + 1 },
      });
    }
  }

  return issues;
}

/** Validate the day selection of the multi-day editor. */
export function validateSelection(days: readonly Day[]): Issue[] {
  return days.length === 0 ? [{ level: "error", code: "no_days" }] : [];
}

function checkTime(
  value: string,
  field: "start" | "end",
  slot: number,
  issues: Issue[],
): number | null {
  const minutes = toMinutes(value);
  if (minutes === null) {
    issues.push({ level: "error", code: "invalid_time", slot, field, params: { value } });
    return null;
  }
  if (!isOnGrid(minutes)) {
    issues.push({ level: "error", code: "off_grid", slot, field, params: { value } });
    return null;
  }
  return minutes;
}

function checkTemp(slot: Slot, idx: number, spec: ProgramSpec, issues: Issue[]): void {
  const range = spec.temp;
  if (!range) return; // CC: temperature ignored
  const t = slot.temp;
  if (t === undefined || !Number.isFinite(t)) {
    issues.push({ level: "error", code: "temp_missing", slot: idx, field: "temp" });
    return;
  }
  if (t < range.min || t > range.max) {
    issues.push({
      level: "error",
      code: "temp_range",
      slot: idx,
      field: "temp",
      params: { min: range.min, max: range.max },
    });
    return;
  }
  if (!isOnStep(t, range.step)) {
    issues.push({
      level: "warning",
      code: "temp_rounded",
      slot: idx,
      field: "temp",
      params: { value: roundToStep(t, range.step) },
    });
  }
  if (spec.lowTempWarning !== undefined && t < spec.lowTempWarning) {
    issues.push({ level: "warning", code: "temp_low", slot: idx, field: "temp" });
  }
}
