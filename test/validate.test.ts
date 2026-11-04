import { describe, expect, it } from "vitest";
import { issueMessage } from "../src/i18n/en.js";
import { PROGRAMS } from "../src/model/programs.js";
import { hasErrors, validateDay, validateSelection, type Issue } from "../src/model/validate.js";

const { z1, hwc, cc } = PROGRAMS;
const codes = (issues: Issue[]) => issues.map((i) => i.code);

describe("validateDay – valid programs from the live controller", () => {
  it("Z1 Monday: 06:30–11:30, 14:00–21:30 @ 25 °C", () => {
    const issues = validateDay(
      [
        { start: "06:30", end: "11:30", temp: 25 },
        { start: "14:00", end: "21:30", temp: 25 },
      ],
      z1,
    );
    expect(issues).toEqual([]);
  });
  it("HWC Monday: 11:00–15:00 @ 55.5 °C (0.5 step is valid)", () => {
    expect(validateDay([{ start: "11:00", end: "15:00", temp: 55.5 }], hwc)).toEqual([]);
  });
  it("CC: temperature is ignored", () => {
    expect(validateDay([{ start: "10:10", end: "10:20", temp: 999 }], cc)).toEqual([]);
  });
  it("empty day (off all day) is valid", () => {
    expect(validateDay([], z1)).toEqual([]);
  });
  it("end 24:00 is valid", () => {
    expect(validateDay([{ start: "23:50", end: "24:00" }], cc)).toEqual([]);
  });
});

describe("validateDay – errors", () => {
  it("malformed time", () => {
    const issues = validateDay([{ start: "6:30", end: "11:30" }], cc);
    expect(issues[0]).toMatchObject({ code: "invalid_time", slot: 0, field: "start" });
  });
  it("off the 10-minute grid", () => {
    expect(codes(validateDay([{ start: "06:35", end: "11:30" }], cc))).toEqual(["off_grid"]);
  });
  it("start 24:00", () => {
    expect(codes(validateDay([{ start: "24:00", end: "24:00" }], cc))).toContain("start_24");
  });
  it("end before or equal start", () => {
    expect(codes(validateDay([{ start: "12:00", end: "11:00" }], cc))).toEqual(["end_before_start"]);
    expect(codes(validateDay([{ start: "12:00", end: "12:00" }], cc))).toEqual(["end_before_start"]);
  });
  it("overlap is reported on the later slot, referencing the earlier one", () => {
    const slots = [
      { start: "11:00", end: "13:00", temp: 22 },
      { start: "06:30", end: "11:30", temp: 25 },
    ];
    const issues = validateDay(slots, z1);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "overlap", slot: 0, params: { other: 2 } });
    expect(issueMessage(issues[0]!)).toBe("Overlaps with slot 2 (06:30–11:30)");
  });
  it("more than 3 slots", () => {
    const slots = ["01", "03", "05", "07"].map((h) => ({ start: `${h}:00`, end: `${h}:30` }));
    expect(codes(validateDay(slots, cc))).toEqual(["too_many_slots"]);
  });
  it("missing temperature for Z1 / HWC", () => {
    expect(codes(validateDay([{ start: "06:00", end: "07:00" }], z1))).toEqual(["temp_missing"]);
    expect(codes(validateDay([{ start: "06:00", end: "07:00", temp: Number.NaN }], hwc))).toEqual([
      "temp_missing",
    ]);
  });
  it.each([
    [z1, 4.5],
    [z1, 30.5],
    [hwc, 34.5],
    [hwc, 70.5],
  ])("temperature out of range (%#)", (spec, temp) => {
    const issues = validateDay([{ start: "06:00", end: "07:00", temp }], spec);
    expect(codes(issues)).toEqual(["temp_range"]);
    expect(hasErrors(issues)).toBe(true);
  });
  it("range limits themselves are valid", () => {
    expect(validateDay([{ start: "06:00", end: "07:00", temp: 35 }], hwc)).toEqual([]);
    expect(validateDay([{ start: "06:00", end: "07:00", temp: 70 }], hwc)).toEqual([]);
  });
});

describe("validateDay – warnings & info (do not block)", () => {
  it("temp not on 0.5 grid -> rounding warning", () => {
    const issues = validateDay([{ start: "06:00", end: "07:00", temp: 21.3 }], z1);
    expect(issues).toEqual([
      { level: "warning", code: "temp_rounded", slot: 0, field: "temp", params: { value: 21.5 } },
    ]);
    expect(hasErrors(issues)).toBe(false);
    expect(issueMessage(issues[0]!)).toBe("Will be rounded to 21.5 °C when saved");
  });
  it("Z1 below 15 °C -> low temperature warning", () => {
    expect(codes(validateDay([{ start: "06:00", end: "07:00", temp: 12 }], z1))).toEqual(["temp_low"]);
  });
  it("touching slots with the same temperature -> mergeable", () => {
    const issues = validateDay(
      [
        { start: "06:00", end: "08:00", temp: 21 },
        { start: "08:00", end: "10:00", temp: 21 },
      ],
      z1,
    );
    expect(issues).toEqual([{ level: "info", code: "mergeable", slot: 1, params: { a: 1, b: 2 } }]);
  });
  it("touching slots with different temperature are fine", () => {
    const slots = [
      { start: "06:00", end: "08:00", temp: 21 },
      { start: "08:00", end: "10:00", temp: 19 },
    ];
    expect(validateDay(slots, z1)).toEqual([]);
  });
  it("touching CC slots -> mergeable", () => {
    const slots = [
      { start: "06:00", end: "08:00" },
      { start: "08:00", end: "10:00" },
    ];
    expect(codes(validateDay(slots, cc))).toEqual(["mergeable"]);
  });
});

describe("validateSelection", () => {
  it("requires at least one day", () => {
    expect(codes(validateSelection([]))).toEqual(["no_days"]);
    expect(validateSelection(["monday"])).toEqual([]);
  });
});
