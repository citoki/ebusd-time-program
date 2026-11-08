import { describe, expect, it } from "vitest";
import { detectCountMessage, programFingerprint, readProgram } from "../src/adapters/mqtt.js";
import { accentStyle, ConfigError, entityId, resolveConfig, setbackEntityId, topic } from "../src/config.js";
import type { Hass } from "../src/hass.js";
import { uniformTemp } from "../src/components/week-preview.js";
import { programName } from "../src/i18n/index.js";
import { PROGRAMS } from "../src/model/programs.js";
import { SAMPLE_SETBACK, SAMPLE_WEEKS, SAMPLE_Z2, sampleStates } from "./fixtures/hass-states.js";

const live = (): Hass => ({ states: sampleStates() });
const cfg = resolveConfig({ type: "custom:ebusd-time-program-card" });
const { z1, hwc, cc } = PROGRAMS;

describe("config", () => {
  it("derives the Z1 set-back sensor (single value, no field suffix)", () => {
    const cfg = resolveConfig({ type: "x" });
    const z1Of = (c: ReturnType<typeof resolveConfig>) => setbackEntityId(c, c.programs[0]!);
    expect(z1Of(cfg)).toBe("sensor.ebusd_ctlv2_z1setbacktemp");
    expect(sampleStates()[z1Of(cfg)!]?.state).toBe(SAMPLE_SETBACK);
    expect(z1Of(resolveConfig({ type: "x", mqtt_prefix: "vaillant" }))).toBe("sensor.vaillant_ctlv2_z1setbacktemp");
    expect(z1Of(resolveConfig({ type: "x", setback_entity: "sensor.my_setback" }))).toBe("sensor.my_setback");
  });

  it("set-back entity: upstream Z1SetbackTemp first, older Z1NightTemp as fallback", () => {
    const c = resolveConfig({ type: "x" });
    const z1 = c.programs[0]!;
    expect(setbackEntityId(c, z1, { "sensor.ebusd_ctlv2_z1nighttemp": {} })).toBe("sensor.ebusd_ctlv2_z1nighttemp");
    expect(setbackEntityId(c, z1, { "sensor.ebusd_ctlv2_z1setbacktemp": {}, "sensor.ebusd_ctlv2_z1nighttemp": {} })).toBe("sensor.ebusd_ctlv2_z1setbacktemp");
    expect(setbackEntityId(c, z1, {})).toBe("sensor.ebusd_ctlv2_z1setbacktemp");
    // writable message with filter-direction ^w: discovery makes it a number entity
    expect(setbackEntityId(c, z1, { "number.ebusd_ctlv2_z1setbacktemp": {} })).toBe("number.ebusd_ctlv2_z1setbacktemp");
    expect(setbackEntityId(c, z1, { "number.ebusd_ctlv2_z1setbacktemp": {}, "sensor.ebusd_ctlv2_z1nighttemp": {} })).toBe("number.ebusd_ctlv2_z1setbacktemp");
  });

  it("set-back entity per zone; none for HWC and CC", () => {
    const c = resolveConfig({ type: "x", programs: ["z1", { id: "z2", setback_entity: "sensor.z2_setback" }, "z3", "hwc", "cc"], setback_entity: "sensor.z1_setback" });
    expect(c.programs.map((p) => setbackEntityId(c, p))).toEqual([
      "sensor.z1_setback",
      "sensor.z2_setback",
      "sensor.ebusd_ctlv2_z3setbacktemp",
      null,
      null,
    ]);
    expect(c.programs.map((p) => programName(p))).toEqual(["Zone 1", "Zone 2", "Zone 3", "Hot water", "Circulation"]);
  });

  it("theme: brand by default, HA theme on request; accent overrides the colour", () => {
    expect(cfg.theme).toBe("brand");
    expect(resolveConfig({ type: "x", theme: "default" }).theme).toBe("default");
    expect(() => resolveConfig({ type: "x", theme: "dark" as never })).toThrow('Unknown theme "dark"');
    expect(accentStyle(cfg)).toBe("");
    expect(accentStyle(resolveConfig({ type: "x", accent: "" }))).toBe("");
    expect(accentStyle(resolveConfig({ type: "x", theme: "default", accent: "#e07a1f" }))).toBe("--etp-accent:#e07a1f");
  });

  it("layout: auto by default, wide or narrow on request", () => {
    expect(cfg.layout).toBe("auto");
    expect(resolveConfig({ type: "x", layout: "wide" }).layout).toBe("wide");
    expect(() => resolveConfig({ type: "x", layout: "full" as never })).toThrow('Unknown layout "full"');
  });

  it("mode: edit by default, preview on request; stacked off by default", () => {
    expect([cfg.mode, cfg.stacked]).toEqual(["edit", false]);
    const c = resolveConfig({ type: "x", mode: "preview", stacked: true });
    expect([c.mode, c.stacked]).toEqual(["preview", true]);
    expect(() => resolveConfig({ type: "x", mode: "view" as never })).toThrow('Unknown mode "view"');
    expect(cfg.tempLabels).toBe("auto");
    expect(resolveConfig({ type: "x", temp_labels: "always" }).tempLabels).toBe("always");
    expect(() => resolveConfig({ type: "x", temp_labels: "yes" as never })).toThrow('Unknown temp_labels "yes"');
  });

  it("preview_days and preview_label: week and true by default, validated", () => {
    expect([cfg.previewDays, cfg.previewLabel]).toEqual(["week", true]);
    const c = resolveConfig({ type: "x", mode: "preview", preview_days: "today_tomorrow", preview_label: false });
    expect([c.previewDays, c.previewLabel]).toEqual(["today_tomorrow", false]);
    expect(() => resolveConfig({ type: "x", preview_days: "tomorrow" as never })).toThrow('Unknown preview_days "tomorrow"');
  });

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

  it("defaults", () => {
    expect(cfg.prefix).toBe("ebusd");
    expect(cfg.circuit).toBe("ctlv2");
    expect(cfg.programs.map((p) => p.spec.id)).toEqual(["z1", "hwc", "cc"]);
    expect(programName(cfg.programs[0]!)).toBe("Zone 1");
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
    expect(c.programs.map((p) => [p.spec.id, programName(p), p.spec.messagePrefix])).toEqual([
      ["cc", "Circulation", "CcTimer"],
      ["z1", "Living", "Hc1Timer"],
    ]);
  });
  it.each([
    [{ programs: [] }, "non-empty"],
    [{ programs: ["z4"] }, "Unknown program"],
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
