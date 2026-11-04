/** Weekdays in controller order (Monday first, as in `*Timer_Timeframes`). */
export const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type Day = (typeof DAYS)[number];

/**
 * One time slot. Times are `HH:MM` strings exactly as ebusd reads/writes them
 * (`24:00` is a valid end). `temp` is the desired temperature in °C and only
 * present for programs with a temperature (Z1, HWC).
 */
export interface Slot {
  start: string;
  end: string;
  temp?: number;
}

export type Week = Record<Day, Slot[]>;

export type ProgramId = "z1" | "hwc" | "cc";

export interface TempRange {
  min: number;
  max: number;
  step: number;
}

export interface ProgramSpec {
  id: ProgramId;
  /** ebusd message prefix, e.g. `Z1Timer` -> `Z1Timer_Monday`. */
  messagePrefix: string;
  /** null = slots carry no temperature (CC). */
  temp: TempRange | null;
  /** Below this a warning is shown (does not block). */
  lowTempWarning?: number;
}
