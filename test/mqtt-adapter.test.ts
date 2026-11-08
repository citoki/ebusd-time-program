import { describe, expect, it } from "vitest";
import { detectCountMessage, programFingerprint, readProgram } from "../src/adapters/mqtt.js";
import { resolveConfig } from "../src/config.js";
import type { Hass } from "../src/hass.js";
import { uniformTemp } from "../src/components/week-preview.js";
import { PROGRAMS } from "../src/model/programs.js";
import { SAMPLE_WEEKS, SAMPLE_Z2, sampleStates } from "./fixtures/hass-states.js";

const live = (): Hass => ({ states: sampleStates() });
const cfg = resolveConfig({ type: "custom:ebusd-time-program-card" });
const { z1, hwc, cc } = PROGRAMS;

describe("uniformTemp (week preview) with ebusd sensor states", () => {
  it("uniformTemp over the shown rows only", () => {
    const week = readProgram(live(), cfg, z1).days;
    expect(uniformTemp(week, z1, ["monday", "tuesday"])).toBe(21); // workdays only: 21.0
    expect(uniformTemp(week, z1, ["friday", "saturday"])).toBeNull(); // 21.0 and 21.5
  });

  it("uniformTemp: one shared temperature, else null", () => {
    const week = readProgram(live(), cfg, z1).days;
    expect(uniformTemp(week, z1)).toBeNull(); // 21.0 on workdays, 21.5 on the weekend
    expect(uniformTemp(readProgram(live(), cfg, hwc).days, hwc)).toBe(50);
    expect(uniformTemp(readProgram(live(), cfg, cc).days, cc)).toBeNull(); // no temperatures
  });
});

describe("readProgram with ebusd sensor states", () => {
  it("detects Timeframes as count message", () => {
    expect(detectCountMessage(live(), cfg, z1)).toBe("Timeframes");
  });
  it("prefers the current Timeslots when stale Timeframes entities linger", () => {
    const hass = live();
    for (const [id, s] of Object.entries(hass.states)) {
      const current = id.replace("_z1timer_timeframes_", "_z1timer_timeslots_");
      if (s && current !== id) hass.states[current] = { ...s, entity_id: current };
    }
    expect(detectCountMessage(hass, cfg, z1)).toBe("Timeslots");
  });
  it.each([z1, hwc, cc])("$id: reads the whole week", (spec) => {
    const r = readProgram(live(), cfg, spec);
    expect(r.status).toBe("ok");
    expect(r.days).toEqual(SAMPLE_WEEKS[spec.id]);
  });
  it("unused slots (00:00–00:00, temperature unknown) are not returned", () => {
    const hass = live();
    expect(hass.states["sensor.ebusd_ctlv2_hwctimer_monday1_htm"]?.state).toBe("00:00");
    expect(hass.states["sensor.ebusd_ctlv2_hwctimer_monday1_slottemp"]?.state).toBe("unknown");
    expect(readProgram(hass, cfg, hwc).days.monday).toEqual([{ start: "05:30", end: "07:00", temp: 50 }]);
  });
  it("Z2 on a system that has it: Z2Timer_* sensors are read like Z1", () => {
    const r = readProgram({ states: sampleStates({ ...SAMPLE_WEEKS, z2: SAMPLE_Z2 }) }, cfg, PROGRAMS.z2);
    expect(r.status).toBe("ok");
    expect(r.days).toEqual(SAMPLE_Z2);
  });
  it("Z2/Z3 on a system without them -> missing, with the entity looked for", () => {
    for (const spec of [PROGRAMS.z2, PROGRAMS.z3]) {
      const r = readProgram(live(), cfg, spec);
      expect(r.status).toBe("missing");
      expect(r.missing).toContain(`sensor.ebusd_ctlv2_${spec.id}timer_timeframes_slotcount`);
    }
  });
  it("every sensor unavailable -> offline; unknown (not read yet) -> loading", () => {
    const set = (state: string) => {
      const hass = live();
      for (const id of Object.keys(hass.states)) if (id.includes("_hwctimer_")) hass.states[id]!.state = state;
      return readProgram(hass, cfg, hwc);
    };
    expect(set("unavailable").status).toBe("offline");
    expect(set("unknown").status).toBe("loading");
    expect(set("unavailable").days.monday).toBeNull();
  });
  it("one unavailable sensor -> that day null, program loading", () => {
    const hass = live();
    hass.states["sensor.ebusd_ctlv2_z1timer_tuesday1_htm"]!.state = "unavailable";
    const r = readProgram(hass, cfg, z1);
    expect(r.status).toBe("loading");
    expect(r.days.tuesday).toBeNull();
    expect(r.days.monday).not.toBeNull();
  });
  it("wrong prefix -> missing, with the entity id that was looked for", () => {
    const c = resolveConfig({ type: "x", mqtt_prefix: "vaillant" });
    const r = readProgram(live(), c, z1);
    expect(r.status).toBe("missing");
    expect(r.missing).toContain("sensor.vaillant_ctlv2_z1timer_timeframes_slotcount");
  });
  it("falls back to Timeslots naming", () => {
    const renamed: Hass = { states: {} };
    for (const [id, e] of Object.entries(live().states)) {
      const nid = id.replace("_timeframes_", "_timeslots_");
      renamed.states[nid] = { ...e!, entity_id: nid };
    }
    expect(detectCountMessage(renamed, cfg, cc)).toBe("Timeslots");
    expect(readProgram(renamed, cfg, cc).status).toBe("ok");
  });
  it("fingerprint changes only when a program sensor changes", () => {
    const hass = live();
    const before = programFingerprint(hass, cfg, cc);
    hass.states["sensor.unrelated"] = { ...hass.states["sensor.ebusd_ctlv2_cctimer_sunday0_htm"]!, state: "x" };
    expect(programFingerprint(hass, cfg, cc)).toBe(before);
    hass.states["sensor.ebusd_ctlv2_cctimer_sunday0_htm"]!.state = "10:00";
    expect(programFingerprint(hass, cfg, cc)).not.toBe(before);
  });
});
