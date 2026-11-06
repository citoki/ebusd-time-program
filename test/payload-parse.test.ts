import { describe, expect, it } from "vitest";
import { parseCount, parseDay } from "../src/model/parse.js";
import { buildDayPayloads, InvalidDayError, readMessage, writeMessage } from "../src/model/payload.js";
import { PROGRAMS } from "../src/model/programs.js";

const { z1, hwc, cc } = PROGRAMS;

describe("message names", () => {
  it("builds ebusd message names", () => {
    expect(writeMessage(z1, "monday")).toBe("Z1Timer_Monday");
    expect(writeMessage(cc, "sunday")).toBe("CcTimer_Sunday");
    expect(readMessage(hwc, "friday", 2)).toBe("HwcTimer_Friday2");
  });
});

describe("buildDayPayloads – payloads verified on the controller", () => {
  it("CC two slots, no constant field", () => {
    expect(
      buildDayPayloads(cc, [
        { start: "10:00", end: "10:30" },
        { start: "14:00", end: "14:30" },
      ]),
    ).toEqual(["0;2;10:00;10:30", "1;2;14:00;14:30"]);
  });
  it("three slots, every message carries the count", () => {
    expect(
      buildDayPayloads(cc, [
        { start: "06:00", end: "06:10" },
        { start: "12:00", end: "12:10" },
        { start: "18:00", end: "18:10" },
      ]),
    ).toEqual(["0;3;06:00;06:10", "1;3;12:00;12:10", "2;3;18:00;18:10"]);
  });
  it("empty day", () => {
    expect(buildDayPayloads(cc, [])).toEqual(["0;0;00:00;00:00"]);
  });
  it("end 24:00", () => {
    expect(buildDayPayloads(cc, [{ start: "23:50", end: "24:00" }])).toEqual(["0;1;23:50;24:00"]);
  });
});

describe("buildDayPayloads – temperature programs", () => {
  it("Z1: sorted by start, temperature with one decimal", () => {
    expect(
      buildDayPayloads(z1, [
        { start: "14:00", end: "21:30", temp: 25 },
        { start: "06:30", end: "11:30", temp: 25 },
      ]),
    ).toEqual(["0;2;06:30;11:30;25.0", "1;2;14:00;21:30;25.0"]);
  });
  it("HWC: 0.5 step kept", () => {
    expect(buildDayPayloads(hwc, [{ start: "11:00", end: "15:00", temp: 55.5 }])).toEqual([
      "0;1;11:00;15:00;55.5",
    ]);
  });
  it("off-grid temperature is rounded to the step", () => {
    expect(buildDayPayloads(z1, [{ start: "06:00", end: "07:00", temp: 21.3 }])).toEqual([
      "0;1;06:00;07:00;21.5",
    ]);
  });
  it("empty day sends '-' as temperature", () => {
    expect(buildDayPayloads(z1, [])).toEqual(["0;0;00:00;00:00;0.0"]);
  });
});

describe("buildDayPayloads – refuses invalid input", () => {
  it.each([
    ["overlap", [{ start: "06:00", end: "08:00" }, { start: "07:00", end: "09:00" }]],
    ["off grid", [{ start: "06:05", end: "08:00" }]],
    ["end before start", [{ start: "08:00", end: "06:00" }]],
    [
      "too many slots",
      [
        { start: "01:00", end: "02:00" },
        { start: "03:00", end: "04:00" },
        { start: "05:00", end: "06:00" },
        { start: "07:00", end: "08:00" },
      ],
    ],
  ])("%s", (_name, slots) => {
    expect(() => buildDayPayloads(cc, slots)).toThrow(InvalidDayError);
  });
  it("temperature out of range", () => {
    expect(() => buildDayPayloads(hwc, [{ start: "06:00", end: "07:00", temp: 80 }])).toThrow(InvalidDayError);
  });
});

describe("parseCount", () => {
  it.each([
    ["2", 2],
    ["0", 0],
    ["3", 3],
  ])("%s", (s, n) => expect(parseCount(s)).toBe(n));
  it.each([undefined, "unknown", "unavailable", "4", "-1", "1.5"])("rejects %j", (s) =>
    expect(parseCount(s)).toBeNull(),
  );
});

describe("parseDay – HA sensor states as read on 2026-11-04", () => {
  it("Z1 Monday: cuts at count, ignores the unused 3rd slot", () => {
    const raw = [
      { start: "06:30", end: "11:30", temp: "25.0" },
      { start: "14:00", end: "21:30", temp: "25.0" },
      { start: "00:00", end: "00:00", temp: "unknown" },
    ];
    expect(parseDay(2, raw, z1)).toEqual([
      { start: "06:30", end: "11:30", temp: 25 },
      { start: "14:00", end: "21:30", temp: 25 },
    ]);
  });
  it("HWC Monday with 55.5 °C", () => {
    expect(parseDay(1, [{ start: "11:00", end: "15:00", temp: "55.5" }], hwc)).toEqual([
      { start: "11:00", end: "15:00", temp: 55.5 },
    ]);
  });
  it("CC ignores temperature", () => {
    expect(parseDay(1, [{ start: "10:10", end: "10:20" }], cc)).toEqual([{ start: "10:10", end: "10:20" }]);
  });
  it("count 0 -> empty day", () => {
    expect(parseDay(0, [], cc)).toEqual([]);
  });
  it("missing data -> null (still loading)", () => {
    expect(parseDay(null, [], cc)).toBeNull();
    expect(parseDay(2, [{ start: "06:30", end: "11:30" }], cc)).toBeNull();
    expect(parseDay(1, [{ start: "unavailable", end: "11:30" }], cc)).toBeNull();
    expect(parseDay(1, [{ start: "06:30", end: "11:30", temp: "unknown" }], z1)).toBeNull();
  });
  it("round trip: parsed controller data produces the same payloads", () => {
    const day = parseDay(2, [
      { start: "10:10", end: "10:20" },
      { start: "14:10", end: "14:20" },
    ], cc)!;
    expect(buildDayPayloads(cc, day)).toEqual(["0;2;10:10;10:20", "1;2;14:10;14:20"]);
  });
});
