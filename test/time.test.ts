import { describe, expect, it } from "vitest";
import { fromMinutes, isOnGrid, isOnStep, roundToStep, toMinutes } from "../src/model/time.js";

describe("toMinutes", () => {
  it.each([
    ["00:00", 0],
    ["06:30", 390],
    ["23:50", 1430],
    ["24:00", 1440],
  ])("%s -> %i", (s, m) => expect(toMinutes(s)).toBe(m));

  it.each(["24:10", "25:00", "12:60", "6:30", "06:3", "", "-", "unknown"])(
    "rejects %j",
    (s) => expect(toMinutes(s)).toBeNull(),
  );
});

describe("fromMinutes", () => {
  it("formats with padding and 24:00", () => {
    expect(fromMinutes(0)).toBe("00:00");
    expect(fromMinutes(390)).toBe("06:30");
    expect(fromMinutes(1440)).toBe("24:00");
  });
  it("throws out of range", () => {
    expect(() => fromMinutes(-10)).toThrow(RangeError);
    expect(() => fromMinutes(1450)).toThrow(RangeError);
    expect(() => fromMinutes(1.5)).toThrow(RangeError);
  });
});

describe("grid & steps", () => {
  it("10-minute grid", () => {
    expect(isOnGrid(390)).toBe(true);
    expect(isOnGrid(395)).toBe(false);
  });
  it("0.5 °C steps", () => {
    expect(roundToStep(55.4, 0.5)).toBe(55.5);
    expect(roundToStep(21.2, 0.5)).toBe(21);
    expect(roundToStep(21.25, 0.5)).toBe(21.5);
    expect(isOnStep(55.5, 0.5)).toBe(true);
    expect(isOnStep(55.3, 0.5)).toBe(false);
  });
});
