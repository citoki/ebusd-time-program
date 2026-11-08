import { describe, expect, it } from "vitest";
import { accentStyle, ConfigError, entityId, resolveConfig, setbackEntityId, setbackWrite, topic } from "../src/config.js";
import { programName, programTabLabel } from "../src/i18n/index.js";
import { SAMPLE_SETBACK, sampleStates } from "./fixtures/hass-states.js";

const cfg = resolveConfig({ type: "custom:ebusd-time-program-card" });

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

  it("set-back write: number service, else the MQTT set topic of the message; none for custom sensors", () => {
    const write = (c: ReturnType<typeof resolveConfig>, i: number, states: Record<string, unknown>) =>
      setbackWrite(c, c.programs[i]!, setbackEntityId(c, c.programs[i]!, states));
    const c = resolveConfig({ type: "x" });
    expect(write(c, 0, { "number.ebusd_ctlv2_z1setbacktemp": {} })).toEqual({ kind: "service", domain: "number", entity: "number.ebusd_ctlv2_z1setbacktemp" });
    expect(write(c, 0, { "sensor.ebusd_ctlv2_z1setbacktemp": {} })).toEqual({ kind: "mqtt", topic: "ebusd/ctlv2/Z1SetbackTemp/set" });
    expect(write(c, 0, { "sensor.ebusd_ctlv2_z1nighttemp": {} })).toEqual({ kind: "mqtt", topic: "ebusd/ctlv2/Z1NightTemp/set" });
    expect(write(resolveConfig({ type: "x", setback_entity: "sensor.my_setback" }), 0, {})).toBeNull();
    expect(write(resolveConfig({ type: "x", setback_entity: "input_number.setback" }), 0, {})).toEqual({ kind: "service", domain: "input_number", entity: "input_number.setback" });
    expect(write(c, 1, {})).toBeNull(); // HWC
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
    // tab: the configured name, else the short form
    expect(c.programs.map((p) => programTabLabel(p))).toEqual(["CC", "Living"]);
  });
  it("source: MQTT by default; vaillant_ebus with entry and refresh interval", () => {
    expect([cfg.source, cfg.entryId, cfg.refreshInterval]).toEqual(["mqtt", null, 300]);
    const c = resolveConfig({ type: "x", source: "vaillant_ebus", entry_id: " abc ", refresh_interval: 0 });
    expect([c.source, c.entryId, c.refreshInterval]).toEqual(["vaillant_ebus", "abc", 0]);
  });
  it.each([
    [{ programs: [] }, "non-empty"],
    [{ programs: ["z4"] }, "Unknown program"],
    [{ programs: ["cc", "cc"] }, "twice"],
    [{ source: "rest" }, "Unknown source"],
    [{ refresh_interval: -1 }, "refresh_interval"],
  ])("rejects %j", (extra, msg) => {
    expect(() => resolveConfig({ type: "x", ...(extra as object) })).toThrow(ConfigError);
    expect(() => resolveConfig({ type: "x", ...(extra as object) })).toThrow(msg);
  });
});
