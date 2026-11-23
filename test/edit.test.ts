import { describe, expect, it } from "vitest";
import {
  clampTemp,
  clampTime,
  defaultTemp,
  mergedSlot,
  mergeNeedsTemp,
  mergeSlots,
  openTime,
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

  it("the sheet opens with an off-grid time as it is, only kept in range", () => {
    expect(openTime(t("17:22"), "start")).toBe(t("17:22"));
    expect(openTime(t("23:55"), "start")).toBe(t("23:50"));
    expect(openTime(t("00:05"), "end")).toBe(t("00:10"));
  });

  it("stepping an off-grid time moves to the next grid time in that direction", () => {
    expect(stepTime(t("17:22"), 10, "start")).toBe(t("17:30"));
    expect(stepTime(t("17:22"), -10, "start")).toBe(t("17:20"));
    expect(stepTime(t("23:58"), 10, "end")).toBe(t("24:00"));
    expect(stepPart(t("17:22"), "minute", 1, "start")).toBe(t("17:30"));
    expect(stepPart(t("17:22"), "minute", -1, "start")).toBe(t("17:20"));
    expect(stepPart(t("17:55"), "minute", 1, "start")).toBe(t("17:00"));
    expect(stepPart(t("17:22"), "hour", 1, "start")).toBe(t("18:20"));
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

describe("mergeSlots", () => {
  const day: Slot[] = [
    { start: "06:00", end: "08:00", temp: 21 },
    { start: "17:00", end: "22:00", temp: 19 },
    { start: "22:00", end: "23:00", temp: 19 },
  ];

  it("fills the gap and keeps the first slot's temperature", () => {
    expect(mergeSlots(day, 0)).toEqual([
      { start: "06:00", end: "22:00", temp: 21 },
      { start: "22:00", end: "23:00", temp: 19 },
    ]);
  });

  it("merges touching slots", () => {
    expect(mergeSlots(day, 1)).toEqual([day[0], { start: "17:00", end: "23:00", temp: 19 }]);
  });

  it("covers overlapping and contained slots", () => {
    expect(mergeSlots([{ start: "06:00", end: "20:00", temp: 20 }, { start: "07:00", end: "09:00", temp: 22 }], 0)).toEqual([
      { start: "06:00", end: "20:00", temp: 20 },
    ]);
  });

  it("works without temperatures and takes the second temperature when the first is missing", () => {
    expect(mergeSlots([{ start: "06:00", end: "07:00" }, { start: "08:00", end: "09:00" }], 0)).toEqual([
      { start: "06:00", end: "09:00" },
    ]);
    expect(mergeSlots([{ start: "06:00", end: "07:00" }, { start: "08:00", end: "09:00", temp: 20 }], 0)).toEqual([
      { start: "06:00", end: "09:00", temp: 20 },
    ]);
  });

  it("takes a given merged slot (temperature chosen in the sheet)", () => {
    const merged = { ...mergedSlot(day, 0)!, temp: 19 };
    expect(mergeSlots(day, 0, merged)).toEqual([{ start: "06:00", end: "22:00", temp: 19 }, day[2]]);
  });

  it("asks for a temperature only for differing per-slot temperatures", () => {
    expect(mergeNeedsTemp(day, 0, z1)).toBe(true);
    expect(mergeNeedsTemp(day, 1, z1)).toBe(false); // both 19
    expect(mergeNeedsTemp(day, 0, hwc)).toBe(false); // one temperature for all slots
    expect(mergeNeedsTemp(day, 0, cc)).toBe(false); // no temperature
    expect(mergeNeedsTemp([{ start: "06:00", end: "07:00" }, day[1]!], 0, z1)).toBe(false);
  });

  it("refuses the last slot and invalid times", () => {
    expect(mergeSlots(day, 2)).toBeNull();
    expect(mergeSlots([{ start: "xx", end: "07:00" }, { start: "08:00", end: "09:00" }], 0)).toBeNull();
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

  it("starts on the grid after a slot that ends off it", () => {
    expect(suggestSlot([{ start: "17:22", end: "19:58", temp: 21 }], z1)).toEqual({ start: "21:00", end: "22:00", temp: 21 });
    // first free gap: start rounded up, end before the next slot rounded down
    const g = suggestSlot(
      [
        { start: "00:00", end: "05:03" },
        { start: "05:47", end: "24:00" },
      ],
      cc,
    );
    expect(g).toEqual({ start: "05:10", end: "05:40" });
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
