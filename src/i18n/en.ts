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

export function issueMessage(issue: Issue): string {
  return ISSUE_MESSAGES[issue.code](issue.params ?? {});
}

export function formatTemp(value: number): string {
  return value.toFixed(1);
}
