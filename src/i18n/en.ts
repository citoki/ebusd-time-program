import type { Issue, IssueCode } from "../model/validate.js";

type Params = Record<string, string | number>;

/** English validation messages. More languages are added later as sibling files. */
export const ISSUE_MESSAGES: Record<IssueCode, (p: Params) => string> = {
  invalid_time: (p) => `Invalid time "${p.value}"`,
  off_grid: () => "Time must be on a 10-minute step",
  start_24: () => "24:00 is only allowed as end time",
  end_before_start: () => "End must be after start",
  overlap: (p) => `Overlaps with slot ${p.other} (${p.range})`,
  too_many_slots: (p) => `Maximum of ${p.max} slots reached`,
  temp_missing: () => "Temperature is required",
  temp_range: (p) => `Temperature must be between ${p.min} and ${p.max} °C`,
  temp_rounded: (p) => `Will be rounded to ${formatTemp(Number(p.value))} °C when saved`,
  temp_low: () => "Low temperature – intended?",
  mergeable: (p) => `Slots ${p.a} and ${p.b} touch – could be merged`,
  no_days: () => "Select at least one day",
};

export const UI = {
  days: "Days",
  quickSelect: "Quick select",
  preview: "Preview",
  start: "Start",
  end: "End",
  temp: "Temp.",
  slot: (n: number) => (n === 1 ? "1 slot" : `${n} slots`),
  offAllDay: "Off all day",
  loading: "Loading…",
  noDaySelected: "Select at least one day",
  presets: { all: "All", weekdays: "Mo–Fr", weekend: "Sa–Su" },
  dayShort: { monday: "Mo", tuesday: "Tu", wednesday: "We", thursday: "Th", friday: "Fr", saturday: "Sa", sunday: "Su" },
  dayLong: {
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
    saturday: "Saturday",
    sunday: "Sunday",
  },
  sameProgram: (days: string) => `${days} share the same program`,
  differentPrograms: "Selected days have different programs.",
  showingFrom: "Showing",
  hint: {
    z1: "Outside these slots the zone uses its set-back temperature (set on the controller).",
    hwc: "Outside these slots hot water is not heated.",
    cc: "Outside these slots the pump is off.",
  },
  status: {
    ok: "Connected – values from ebusd",
    loading: "Waiting for values from ebusd…",
    missing: "No ebusd entities found",
  },
  missingLookedFor: "Looked for one of:",
  missingHelp: "Check mqtt_prefix, circuit and entity_template in the card configuration.",
  readOnly: "Read-only preview – editing comes in a later version.",
} as const;

export function issueMessage(issue: Issue): string {
  return ISSUE_MESSAGES[issue.code](issue.params ?? {});
}

export function formatTemp(value: number): string {
  return value.toFixed(1);
}
