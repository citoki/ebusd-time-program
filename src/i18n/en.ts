import type { IssueCode } from "../model/validate.js";
import { formatTemp } from "./format.js";

export type Params = Record<string, string | number>;
type Field = "start" | "end" | "temp";

const FIELD: Record<Field, string> = { start: "Start", end: "End", temp: "Temperature" };

/**
 * English UI texts; the shape of every other language (`Strings`). Plain
 * strings or small functions for counts and values. Temperatures go through
 * formatTemp() so they get the language's decimal separator.
 */
export const en = {
  // card and program names (used when the YAML does not set them)
  defaultTitle: "Weekly schedule",
  programNames: { z1: "Zone 1", z2: "Zone 2", z3: "Zone 3", hwc: "Hot water", cc: "Circulation" },
  programShort: { z1: "Z1", z2: "Z2", z3: "Z3", hwc: "HWC", cc: "CC" },
  issues: {
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
  } as Record<IssueCode, (p: Params) => string>,
  days: "Days",
  quickSelect: "Quick select",
  schedule: "Current schedule",
  now: "Now",
  start: "Start",
  end: "End",
  temp: "Temp.",
  slot: (n: number) => (n === 1 ? "1 slot" : `${n} slots`),
  slotN: (n: number) => `Slot ${n}`,
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
  info: "About this time program",
  hint: {
    zone: (setback: number | null) =>
      setback === null
        ? "Outside these slots the zone only heats to its set-back temperature."
        : `Outside these slots the zone only heats to its set-back temperature of ${formatTemp(setback)} °C.`,
    hwc: () => "Outside these slots hot water is not reheated.",
    cc: () => "Outside these slots the circulation pump is off.",
  },
  status: {
    ok: "Connected – values from ebusd",
    loading: "Waiting for values from ebusd…",
    offline: "ebusd not available",
    missing: "No ebusd entities found",
  },
  offlineHelp: "All sensors of this program are unavailable. Check that the ebusd add-on is running and connected to MQTT.",
  missingLookedFor: "Looked for one of:",
  missingHelp: "Check mqtt_prefix, circuit and entity_template in the card configuration.",
  offlineHelpService: "Could not read this program through the Vaillant eBUS integration. Check that it is loaded and connected to ebusd.",
  missingHelpService: "Check that the Vaillant eBUS integration is installed (with the read_time_program action) and the program's message_prefix.",
  missingZone: (name: string, id: string) => `If this system has no ${name}, remove ${id} from programs.`,
  startEmpty: "Start empty",
  unsaved: "unsaved changes",
  // slot editor
  addSlot: "Add time slot",
  slotsLeft: (n: number) => `(${n} left)`,
  noGap: "No free time left on this day",
  deleteSlot: (n: number) => `Delete slot ${n}`,
  editField: (field: Field, n: number) => `${FIELD[field]}, slot ${n}`,
  tempUnknown: "– °C",
  // sheets
  sheetTitle: (field: Field, n: number) => `${FIELD[field]} · Slot ${n}`,
  hour: "Hour",
  minute: "Minute",
  up: (what: string) => `${what} up`,
  down: (what: string) => `${what} down`,
  minus10: "−10 min",
  plus10: "+10 min",
  tempDown: "Lower temperature",
  tempUp: "Raise temperature",
  done: "Done",
  cancel: "Cancel",
  setbackTitle: "Set-back temperature",
  save: "Save",
  saveFailed: (message: string) => `Could not save: ${message}`,
  setbackReadOnly: "Change it on the controller.",
  // apply bar
  change: "Change:",
  dayCount: (n: number) => (n === 1 ? "1 day" : `${n} days`),
  unchangedDays: (days: string) => `${days} unchanged`,
  errors: (n: number) => (n === 1 ? "1 error – fix before applying" : `${n} errors – fix before applying`),
  slotsAdded: (n: number) => (n === 1 ? "1 slot added" : `${n} slots added`),
  slotsRemoved: (n: number) => (n === 1 ? "1 slot removed" : `${n} slots removed`),
  discard: "Discard",
  applyTo: (n: number) => `Apply to ${n === 1 ? "1 day" : `${n} days`}`,
  close: "Close",
  // write job (busy panel)
  writing: (program: string) => `Writing ${program} …`,
  restoring: (program: string) => `Restoring ${program} …`,
  progress: (done: number, total: number) => `${done} / ${total}`,
  dayState: {
    queued: "waiting",
    writing: "writing",
    verifying: "verifying",
    done: "done",
    failed: "failed",
    skipped: "not written",
  },
  cancelAfterDay: "Cancel after this day",
  cancelling: "Stopping after this day …",
  saved: (days: string, n: number) => `Saved to ${days} (${n === 1 ? "1 day" : `${n} days`}) – confirmed by the controller`,
  restored: "Previous program restored",
  failedAt: (day: string) => `Write stopped at ${day}`,
  cancelled: "Write cancelled",
  cancelledHelp: (written: string) => (written ? `Already written: ${written}.` : "No day was written."),
  reason: {
    count: (actual: number, expected: number) => `Controller reports ${actual} slot(s), expected ${expected}`,
    slot: (index: number, actual: string, expected: string) =>
      `Slot ${index + 1}: controller has ${actual}, expected ${expected}`,
    timeout: (s: number) => `No confirmation from the controller within ${s} s`,
    publish: (message: string) => `Could not publish to MQTT: ${message}`,
    service: (message: string) => `Vaillant eBUS: ${message}`,
  },
  restorePrevious: "Restore previous",
  retry: "Retry",
  continueWrite: "Continue",
  noMqtt: "This Home Assistant connection cannot call services (mqtt.publish).",
  otherCardBusy: "Another card is writing to the controller right now. Try again when it has finished.",
  leaveWarning: "The time program is still being written. Leaving now may leave days unchanged.",
  busyStatus: "Writing to the controller …",
};

export type Strings = typeof en;
