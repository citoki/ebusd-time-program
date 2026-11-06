import { describe, expect, it } from "vitest";
import { detectCountMessage, programFingerprint, readProgram } from "../src/adapters/mqtt.js";
import { accentStyle, ConfigError, entityId, resolveConfig, setbackEntityId, topic } from "../src/config.js";
import type { Hass } from "../src/hass.js";
import { PROGRAMS } from "../src/model/programs.js";
import { SAMPLE_SETBACK, SAMPLE_WEEKS, sampleStates } from "./fixtures/hass-states.js";

const live = (): Hass => ({ states: sampleStates() });
const cfg = resolveConfig({ type: "custom:ebusd-time-program-card" });
const { z1, hwc, cc } = PROGRAMS;

describe("config", () => {
  it("derives the Z1 set-back sensor (single value, no field suffix)", () => {
    const cfg = resolveConfig({ type: "x" });
    expect(setbackEntityId(cfg)).toBe("sensor.ebusd_ctlv2_z1nighttemp");
    expect(sampleStates()[setbackEntityId(cfg)]?.state).toBe(SAMPLE_SETBACK);
    expect(setbackEntityId(resolveConfig({ type: "x", mqtt_prefix: "vaillant" }))).toBe("sensor.vaillant_ctlv2_z1nighttemp");
    expect(setbackEntityId(resolveConfig({ type: "x", setback_entity: "sensor.my_setback" }))).toBe("sensor.my_setback");
  });

  it("theme: brand by default, HA theme on request; accent overrides the colour", () => {
    expect(cfg.theme).toBe("brand");
    expect(resolveConfig({ type: "x", theme: "default" }).theme).toBe("default");
    expect(() => resolveConfig({ type: "x", theme: "dark" as never })).toThrow('Unknown theme "dark"');
    expect(accentStyle(cfg)).toBe("");
    expect(accentStyle(resolveConfig({ type: "x", accent: "" }))).toBe("");
    expect(accentStyle(resolveConfig({ type: "x", theme: "default", accent: "#e07a1f" }))).toBe("--etp-accent:#e07a1f");
  });

  it("defaults", () => {
    expect(cfg.prefix).toBe("ebusd");
    expect(cfg.circuit).toBe("ctlv2");
    expect(cfg.programs.map((p) => p.spec.id)).toEqual(["z1", "hwc", "cc"]);
    expect(cfg.programs[0]!.name).toBe("Zone 1");
  });
  it("entity ids are lower-cased after the domain", () => {
    expect(entityId(cfg, "Z1Timer_Monday0", "htm_1")).toBe("sensor.ebusd_ctlv2_z1timer_monday0_htm_1");
  });
  it("topics keep the ebusd case", () => {
    expect(topic(cfg, "Z1Timer_Monday", "set")).toBe("ebusd/ctlv2/Z1Timer_Monday/set");
  });
  it("custom prefix and templates", () => {
    const c = resolveConfig({
      type: "x",
      mqtt_prefix: "heating",
      circuit: "15",
      topic_template: "bus/{prefix}/{circuit}/{message}/{action}",
      entity_template: "sensor.{prefix}_{message}_{field}",
    });
    expect(topic(c, "CcTimer_Sunday", "get")).toBe("bus/heating/15/CcTimer_Sunday/get");
    expect(entityId(c, "CcTimer_Sunday0", "htm")).toBe("sensor.heating_cctimer_sunday0_htm");
  });
  it("program options", () => {
    const c = resolveConfig({ type: "x", programs: ["cc", { id: "z1", name: "Living", message_prefix: "Hc1Timer" }] });
    expect(c.programs.map((p) => [p.spec.id, p.name, p.spec.messagePrefix])).toEqual([
      ["cc", "Circulation", "CcTimer"],
      ["z1", "Living", "Hc1Timer"],
    ]);
  });
  it.each([
    [{ programs: [] }, "non-empty"],
    [{ programs: ["z2"] }, "Unknown program"],
    [{ programs: ["cc", "cc"] }, "twice"],
  ])("rejects %j", (extra, msg) => {
    expect(() => resolveConfig({ type: "x", ...(extra as object) })).toThrow(ConfigError);
    expect(() => resolveConfig({ type: "x", ...(extra as object) })).toThrow(msg);
  });
});

describe("readProgram with ebusd sensor states", () => {
  it("detects Timeframes as count message", () => {
    expect(detectCountMessage(live(), cfg, z1)).toBe("Timeframes");
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
