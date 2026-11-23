import { hasErrors, validateDay } from "./validate.js";
import { normalizeSlots, perSlotTemp } from "./week.js";
import type { Day, ProgramSpec, Slot } from "./types.js";

const DAY_NAMES: Record<Day, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

/** ebusd write message name, e.g. `Z1Timer_Monday`. */
export function writeMessage(spec: ProgramSpec, day: Day): string {
  return `${spec.messagePrefix}_${DAY_NAMES[day]}`;
}

/** ebusd read message name of one slot, e.g. `Z1Timer_Monday0`. */
export function readMessage(spec: ProgramSpec, day: Day, slot: number): string {
  return `${writeMessage(spec, day)}${slot}`;
}

export class InvalidDayError extends Error {
  constructor(readonly issues: ReturnType<typeof validateDay>) {
    super(`refusing to build payload for invalid day: ${issues.map((i) => i.code).join(", ")}`);
    this.name = "InvalidDayError";
  }
}

/**
 * Temperature field of programs with a shared temperature (HWC): `-` (0xFFFF) leaves
 * `HwcTempDesired` as it is. Verified on a VRC 720 (ctlv2, 2026-11-22: times applied,
 * HwcTempDesired unchanged) and on BASS3 (issue #7). Any number would become the
 * temperature of every slot on every day.
 */
const KEEP_TEMP = "-";

/**
 * Build the ordered `/set` payloads that rewrite one whole day.
 *
 * Verified on a VRC 720: a day is only applied when all slots `0…count-1`
 * arrive in order; partial writes are ACKed but ignored. An empty day is a
 * single message with count 0. Throws on invalid input (second safety net
 * behind the UI validation).
 */
export function buildDayPayloads(spec: ProgramSpec, slots: readonly Slot[]): string[] {
  const issues = validateDay(slots, spec);
  if (hasErrors(issues)) throw new InvalidDayError(issues.filter((i) => i.level === "error"));

  const sorted = normalizeSlots(slots, spec);
  if (sorted.length === 0) {
    // CC verified by writing it to the controller. For temperature programs
    // this is exactly what the myVAILLANT app sends (traced 2026-11-05, Z1 Sunday:
    // `a6 00 00 06 00 00 0000 0000 0000`, temp 0x0000 = 0.0). The controller
    // then reads the empty slots back as `00:00;00:00;-`.
    if (!spec.temp) return ["0;0;00:00;00:00"];
    return [perSlotTemp(spec) ? "0;0;00:00;00:00;0.0" : `0;0;00:00;00:00;${KEEP_TEMP}`];
  }
  const count = sorted.length;
  return sorted.map((s, i) => {
    const base = `${i};${count};${s.start};${s.end}`;
    if (!spec.temp) return base;
    return `${base};${perSlotTemp(spec) ? s.temp!.toFixed(1) : KEEP_TEMP}`;
  });
}
