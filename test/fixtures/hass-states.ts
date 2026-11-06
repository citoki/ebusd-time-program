import { countField, FIELD } from "../../src/adapters/mqtt.js";
import { entityId, resolveConfig } from "../../src/config.js";
import type { HassEntity } from "../../src/hass.js";
import { readMessage } from "../../src/model/payload.js";
import { MAX_SLOTS, PROGRAMS } from "../../src/model/programs.js";
import { DAYS, type ProgramId, type Slot, type Week } from "../../src/model/types.js";

/**
 * Example week programs, laid out as the HA sensors that ebusd's MQTT discovery
 * creates for a VRC 720 (circuit ctlv2, prefix ebusd). Made-up values.
 */
const week = (workday: Slot[], weekend: Slot[]): Week =>
  Object.fromEntries(DAYS.map((d) => [d, d === "saturday" || d === "sunday" ? weekend : workday])) as Week;

/** A system with one heating zone (no Z2/Z3 sensors), like most installations. */
export const SAMPLE_WEEKS: Partial<Record<ProgramId, Week>> = {
  z1: week(
    [
      { start: "06:00", end: "08:00", temp: 21 },
      { start: "16:00", end: "22:00", temp: 21 },
    ],
    [
      { start: "07:30", end: "12:00", temp: 21.5 },
      { start: "15:00", end: "22:30", temp: 21.5 },
    ],
  ),
  hwc: week([{ start: "05:30", end: "07:00", temp: 50 }], [{ start: "07:00", end: "09:00", temp: 50 }]),
  cc: week(
    [
      { start: "06:00", end: "06:10" },
      { start: "18:00", end: "18:10" },
    ],
    [
      { start: "08:00", end: "08:10" },
      { start: "19:00", end: "19:10" },
    ],
  ),
};

/** A second zone, for tests of systems that have one. */
export const SAMPLE_Z2: Week = week([{ start: "17:00", end: "21:00", temp: 20 }], [{ start: "09:00", end: "21:00", temp: 20 }]);

export const SAMPLE_SETBACK = "17.0";

const UPDATED = "2026-01-01T12:00:00+00:00";

/** Sensor states as `hass.states` holds them; a fresh copy on each call. */
export function sampleStates(weeks: Partial<Record<ProgramId, Week>> = SAMPLE_WEEKS): Record<string, HassEntity> {
  const cfg = resolveConfig({ type: "custom:ebusd-time-program-card" });
  const states: Record<string, HassEntity> = {};
  const set = (id: string, state: string) => {
    states[id] = { entity_id: id, state, attributes: {}, last_changed: UPDATED, last_updated: UPDATED };
  };
  for (const spec of Object.values(PROGRAMS)) {
    const days = weeks[spec.id];
    if (!days) continue;
    if (spec.setbackMessage) set(entityId(cfg, spec.setbackMessage, "").replace(/_+$/, ""), SAMPLE_SETBACK);
    DAYS.forEach((day, i) => {
      set(entityId(cfg, `${spec.messagePrefix}_Timeframes`, countField(i)), String(days[day].length));
      // ebusd reads unused slots as 00:00–00:00 without a temperature
      for (let s = 0; s < MAX_SLOTS; s++) {
        const slot = days[day][s];
        const msg = readMessage(spec, day, s);
        set(entityId(cfg, msg, FIELD.start), slot?.start ?? "00:00");
        set(entityId(cfg, msg, FIELD.end), slot?.end ?? "00:00");
        if (spec.temp) set(entityId(cfg, msg, FIELD.temp), slot?.temp !== undefined ? slot.temp.toFixed(1) : "unknown");
      }
    });
  }
  return states;
}
