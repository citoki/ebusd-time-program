import { TIME_STEP } from "./programs.js";

export const MINUTES_PER_DAY = 24 * 60;

const TIME_RE = /^(\d{2}):(\d{2})$/;

/** `HH:MM` -> minutes after midnight (`24:00` = 1440), or null if malformed. */
export function toMinutes(value: string): number | null {
  const m = TIME_RE.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59) return null;
  const total = h * 60 + min;
  return total <= MINUTES_PER_DAY ? total : null;
}

/** Minutes after midnight -> `HH:MM` (1440 -> `24:00`). */
export function fromMinutes(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > MINUTES_PER_DAY) {
    throw new RangeError(`minutes out of range: ${minutes}`);
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function isOnGrid(minutes: number, step = TIME_STEP): boolean {
  return minutes % step === 0;
}

/** Round a value to the nearest multiple of `step` (avoids float noise like 21.499999). */
export function roundToStep(value: number, step: number): number {
  const factor = 1 / step;
  return Math.round(value * factor) / factor;
}

export function isOnStep(value: number, step: number): boolean {
  return Math.abs(roundToStep(value, step) - value) < 1e-9;
}
