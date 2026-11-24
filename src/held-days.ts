import type { ProgramRead } from "./adapters/mqtt.js";
import type { ResolvedConfig } from "./config.js";
import { DAYS, type Day, type ProgramSpec, type Slot } from "./model/types.js";

/**
 * Days a running write job holds back: every card on the page keeps showing their
 * values from before the job until the job has written and read back that day.
 * While ebusd re-reads a day its sensors pass through half-updated states (new
 * slot count, old or missing slots); without this the charts would flicker.
 */

/** Same controller program, whichever card shows it. */
export const programKey = (cfg: ResolvedConfig, spec: ProgramSpec): string =>
  `${cfg.source}|${cfg.entryId ?? ""}|${cfg.prefix}|${cfg.circuit}|${spec.id}`;

let held: { key: string; days: Partial<Record<Day, Slot[]>> } | null = null;
let version = 0;
const listeners = new Set<() => void>();

export const heldDays = {
  /** Changes whenever the held days change (part of the cards' re-read fingerprint). */
  get version(): number {
    return version;
  },
  /** Hold `days` of program `key` at these values; null releases everything. */
  set(key: string | null, days: Partial<Record<Day, Slot[]>> = {}): void {
    held = key === null || Object.keys(days).length === 0 ? null : { key, days };
    version++;
    listeners.forEach((l) => l());
  },
  get(key: string): Partial<Record<Day, Slot[]>> {
    return held?.key === key ? held.days : {};
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/**
 * What a card shows for a program read:
 * - days held by a running write job: their value from before the job,
 * - days that are briefly unreadable (ebusd re-reading them): the last value shown,
 *   unless the whole program is offline.
 */
export function stableRead(read: ProgramRead, hold: Partial<Record<Day, Slot[]>>, last: ProgramRead["days"] | undefined): ProgramRead {
  if (read.status === "missing") return read;
  const days = { ...read.days };
  for (const d of DAYS) {
    const h = hold[d];
    if (h) days[d] = h;
    else if (days[d] === null && read.status !== "offline") days[d] = last?.[d] ?? null;
  }
  const status = read.status === "loading" && DAYS.every((d) => days[d] !== null) ? "ok" : read.status;
  return { ...read, status, days };
}
