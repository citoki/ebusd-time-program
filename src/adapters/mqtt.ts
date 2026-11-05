import { COUNT_MESSAGE_CANDIDATES, entityId, type ResolvedConfig } from "../config.js";
import type { Hass } from "../hass.js";
import { parseCount, parseDay, type RawSlot } from "../model/parse.js";
import { readMessage } from "../model/payload.js";
import { MAX_SLOTS } from "../model/programs.js";
import { DAYS, type Day, type ProgramSpec, type Slot } from "../model/types.js";

/** Field sensor names created by ebusd's HA discovery (PLAN.md §8). */
const FIELD = { start: "htm", end: "htm_1", temp: "slottemp" } as const;
const countField = (dayIndex: number) => (dayIndex === 0 ? "slotcount" : `slotcount_${dayIndex}`);

export type ReadStatus = "ok" | "loading" | "missing";

export interface ProgramRead {
  status: ReadStatus;
  /** Per day; null while that day's sensors are not (yet) usable. */
  days: Record<Day, Slot[] | null>;
  /** Detected/used count message name, e.g. `Timeframes`. */
  countMessage: string | null;
  /** Entity ids that do not exist in HA (only filled when status is `missing`). */
  missing: string[];
}

/**
 * Find the slot-count message name for a program: the configured one, or the
 * first candidate whose Monday sensor exists.
 */
export function detectCountMessage(hass: Hass, cfg: ResolvedConfig, spec: ProgramSpec): string | null {
  const candidates = cfg.countMessage ? [cfg.countMessage] : COUNT_MESSAGE_CANDIDATES;
  for (const name of candidates) {
    if (hass.states[entityId(cfg, `${spec.messagePrefix}_${name}`, countField(0))]) return name;
  }
  return null;
}

/** All entity ids a program reads (used for the "missing" diagnosis and change detection). */
export function programEntityIds(cfg: ResolvedConfig, spec: ProgramSpec, countMessage: string): string[] {
  const ids: string[] = [];
  DAYS.forEach((day, i) => {
    ids.push(entityId(cfg, `${spec.messagePrefix}_${countMessage}`, countField(i)));
    for (let s = 0; s < MAX_SLOTS; s++) {
      const msg = readMessage(spec, day, s);
      ids.push(entityId(cfg, msg, FIELD.start), entityId(cfg, msg, FIELD.end));
      if (spec.temp) ids.push(entityId(cfg, msg, FIELD.temp));
    }
  });
  return ids;
}

/** Read one program's week from the per-field ebusd sensors in `hass.states`. */
export function readProgram(hass: Hass, cfg: ResolvedConfig, spec: ProgramSpec): ProgramRead {
  const empty = Object.fromEntries(DAYS.map((d) => [d, null])) as Record<Day, Slot[] | null>;
  const countMessage = detectCountMessage(hass, cfg, spec);
  if (!countMessage) {
    const tried = (cfg.countMessage ? [cfg.countMessage] : COUNT_MESSAGE_CANDIDATES).map((n) =>
      entityId(cfg, `${spec.messagePrefix}_${n}`, countField(0)),
    );
    return { status: "missing", days: empty, countMessage: null, missing: tried };
  }

  const state = (id: string) => hass.states[id]?.state;
  const days = { ...empty };
  DAYS.forEach((day, i) => {
    const count = parseCount(state(entityId(cfg, `${spec.messagePrefix}_${countMessage}`, countField(i))));
    const raw: RawSlot[] = [];
    for (let s = 0; s < MAX_SLOTS; s++) {
      const msg = readMessage(spec, day, s);
      const slot: RawSlot = {
        start: state(entityId(cfg, msg, FIELD.start)),
        end: state(entityId(cfg, msg, FIELD.end)),
      };
      if (spec.temp) slot.temp = state(entityId(cfg, msg, FIELD.temp));
      raw.push(slot);
    }
    days[day] = parseDay(count, raw, spec);
  });

  const complete = DAYS.every((d) => days[d] !== null);
  return { status: complete ? "ok" : "loading", days, countMessage, missing: [] };
}

/**
 * Cheap change detection: a string of all read states, so the card only
 * re-renders when one of its ~70 sensors changed (hass updates are frequent).
 */
export function programFingerprint(hass: Hass, cfg: ResolvedConfig, spec: ProgramSpec): string {
  const countMessage = detectCountMessage(hass, cfg, spec);
  if (!countMessage) return "missing";
  return programEntityIds(cfg, spec, countMessage)
    .map((id) => hass.states[id]?.state ?? "")
    .join("|");
}
