import { describe, expect, it } from "vitest";
import {
  clampTemp,
  clampTime,
  defaultTemp,
  removeSlot,
  sortSlots,
  stepPart,
  stepTemp,
  stepTime,
  suggestSlot,
  updateSlot,
} from "../src/model/edit.js";
import { PROGRAMS } from "../src/model/programs.js";
import { toMinutes } from "../src/model/time.js";
import type { Slot } from "../src/model/types.js";
import { validateDay } from "../src/model/validate.js";

const { z1, hwc, cc } = PROGRAMS;
const t = (s: string) => toMinutes(s)!;

describe("time stepping", () => {
  it("clamps start to 00:00–23:50 and end to 00:10–24:00", () => {
    expect(clampTime(-10, "start")).toBe(0);
    expect(clampTime(t("24:00"), "start")).toBe(t("23:50"));
    expect(clampTime(0, "end")).toBe(10);
    expect(clampTime(t("24:00"), "end")).toBe(t("24:00"));
  });

  it("snaps to the 10-minute grid", () => {
    expect(clampTime(t("06:34"), "start")).toBe(t("06:30"));
    expect(clampTime(t("06:35"), "start")).toBe(t("06:40"));
  });

  it("±10 min carries into the hour", () => {
    expect(stepTime(t("06:50"), 10, "start")).toBe(t("07:00"));
    expect(stepTime(t("07:00"), -10, "start")).toBe(t("06:50"));
    expect(stepTime(t("23:50"), 10, "end")).toBe(t("24:00"));
    expect(stepTime(t("23:50"), 10, "start")).toBe(t("23:50"));
  });

  it("minute column wraps within the hour", () => {
    expect(stepPart(t("06:50"), "minute", 1, "start")).toBe(t("06:00"));
    expect(stepPart(t("06:00"), "minute", -1, "start")).toBe(t("06:50"));
  });

  it("hour column clamps; 24 forces :00 and only for end", () => {
    expect(stepPart(t("23:30"), "hour", 1, "end")).toBe(t("24:00"));
    expect(stepPart(t("23:30"), "hour", 1, "start")).toBe(t("23:50"));
    expect(stepPart(t("24:00"), "hour", -1, "end")).toBe(t("23:00"));
    expect(stepPart(t("24:00"), "minute", 1, "end")).toBe(t("24:00"));
    expect(stepPart(t("00:30"), "hour", -1, "start")).toBe(t("00:00"));
  });
});

describe("temperature stepping", () => {
  it("steps by 0.5 and clamps to the program range", () => {
    expect(stepTemp(21, 1, z1.temp!)).toBe(21.5);
    expect(stepTemp(30, 1, z1.temp!)).toBe(30);
    expect(stepTemp(35, -1, hwc.temp!)).toBe(35);
  });

  it("rounds off-grid stored values onto the grid", () => {
    expect(clampTemp(21.3, z1.temp!)).toBe(21.5);
    expect(stepTemp(21.3, 1, z1.temp!)).toBe(22);
  });

  it("defaults: Z1 20 °C, HWC 50 °C, CC none", () => {
    expect(defaultTemp(z1)).toBe(20);
    expect(defaultTemp(hwc)).toBe(50);
    expect(defaultTemp(cc)).toBeUndefined();
  });
});

describe("slot list edits", () => {
  const slots: Slot[] = [
    { start: "14:00", end: "21:30", temp: 21 },
    { start: "06:30", end: "11:30", temp: 25 },
  ];

  it("sortSlots orders by start", () => {
    expect(sortSlots(slots).map((s) => s.start)).toEqual(["06:30", "14:00"]);
  });

  it("updateSlot patches and re-sorts", () => {
    const next = updateSlot(sortSlots(slots), 1, { start: "05:00" });
    expect(next.map((s) => s.start)).toEqual(["05:00", "06:30"]);
    expect(next[0]!.temp).toBe(21);
  });

  it("removeSlot drops by index", () => {
    expect(removeSlot(slots, 0)).toEqual([slots[1]]);
  });
});

describe("suggestSlot", () => {
  it("empty day: 06:00–07:00 with the default temperature", () => {
    expect(suggestSlot([], z1)).toEqual({ start: "06:00", end: "07:00", temp: 20 });
    expect(suggestSlot([], cc)).toEqual({ start: "06:00", end: "07:00" });
  });

  it("one hour after the last slot, copying its temperature", () => {
    const s = suggestSlot([{ start: "06:30", end: "11:30", temp: 25 }], z1);
    expect(s).toEqual({ start: "12:30", end: "13:30", temp: 25 });
  });

  it("is cut at 24:00", () => {
    expect(suggestSlot([{ start: "14:00", end: "22:30", temp: 21 }], z1)).toEqual({
      start: "23:30",
      end: "24:00",
      temp: 21,
    });
  });

  it("falls back to the first free gap when the evening is full", () => {
    const s = suggestSlot([{ start: "06:00", end: "24:00", temp: 21 }], z1);
    expect(s).toEqual({ start: "00:00", end: "01:00", temp: 21 });
    const g = suggestSlot(
      [
        { start: "00:00", end: "05:00" },
        { start: "05:30", end: "24:00" },
      ],
      cc,
    );
    expect(g).toEqual({ start: "05:00", end: "05:30" });
  });

  it("returns null when full", () => {
    const three: Slot[] = [
      { start: "01:00", end: "02:00" },
      { start: "03:00", end: "04:00" },
      { start: "05:00", end: "06:00" },
    ];
    expect(suggestSlot(three, cc)).toBeNull();
    expect(suggestSlot([{ start: "00:00", end: "24:00" }], cc)).toBeNull();
  });

  it("suggestions never create validation errors", () => {
    const days: Slot[][] = [
      [],
      [{ start: "06:30", end: "11:30", temp: 25 }],
      [{ start: "00:00", end: "23:00", temp: 25 }],
      [
        { start: "06:00", end: "08:00", temp: 18 },
        { start: "08:10", end: "24:00", temp: 18 },
      ],
    ];
    for (const day of days) {
      const s = suggestSlot(day, z1);
      if (!s) continue;
      const errors = validateDay([...day, s], z1).filter((i) => i.level === "error");
      expect(errors, JSON.stringify(day)).toEqual([]);
    }
  });
});
