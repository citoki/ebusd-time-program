import { describe, expect, it } from "vitest";
import { PROGRAMS } from "../src/model/programs.js";
import type { Slot, Week } from "../src/model/types.js";
import {
  applyDraft,
  draftForSelection,
  emptyWeek,
  normalizeSlots,
  orderDays,
  planWrite,
  PRESETS,
  presetOf,
  sameSlots,
  toggleDay,
} from "../src/model/week.js";

const { z1, cc } = PROGRAMS;

const workday: Slot[] = [
  { start: "06:30", end: "11:30", temp: 25 },
  { start: "14:00", end: "21:30", temp: 25 },
];
const weekendDay: Slot[] = [
  { start: "08:00", end: "11:30", temp: 25 },
  { start: "14:00", end: "21:30", temp: 25 },
];

/** Z1 week as read from the live controller (Mo–Fr identical, Sa/Su different start). */
function liveWeek(): Week {
  const w = emptyWeek();
  for (const d of PRESETS.weekdays) w[d] = workday.map((s) => ({ ...s }));
  for (const d of PRESETS.weekend) w[d] = weekendDay.map((s) => ({ ...s }));
  return w;
}

describe("day selection", () => {
  it("orders Monday first and removes duplicates", () => {
    expect(orderDays(["sunday", "monday", "sunday", "wednesday"])).toEqual(["monday", "wednesday", "sunday"]);
  });
  it("detects presets", () => {
    expect(presetOf(["friday", "monday", "tuesday", "wednesday", "thursday"])).toBe("weekdays");
    expect(presetOf(["sunday", "saturday"])).toBe("weekend");
    expect(presetOf([...PRESETS.all])).toBe("all");
    expect(presetOf(["monday"])).toBeNull();
    expect(presetOf([])).toBeNull();
  });
  it("toggles a day", () => {
    expect(toggleDay(["monday"], "sunday")).toEqual(["monday", "sunday"]);
    expect(toggleDay(["monday", "sunday"], "monday")).toEqual(["sunday"]);
  });
});

describe("normalizeSlots / sameSlots", () => {
  it("sorts by start and rounds temperature to the program step", () => {
    expect(
      normalizeSlots(
        [
          { start: "14:00", end: "21:30", temp: 25.2 },
          { start: "06:30", end: "11:30", temp: 25 },
        ],
        z1,
      ),
    ).toEqual([
      { start: "06:30", end: "11:30", temp: 25 },
      { start: "14:00", end: "21:30", temp: 25 },
    ]);
  });
  it("drops temperature for CC", () => {
    expect(normalizeSlots([{ start: "10:10", end: "10:20", temp: 3 }], cc)).toEqual([
      { start: "10:10", end: "10:20" },
    ]);
  });
  it("compares order-independently", () => {
    expect(sameSlots(workday, [...workday].reverse(), z1)).toBe(true);
    expect(sameSlots(workday, weekendDay, z1)).toBe(false);
    expect(sameSlots(workday, [{ ...workday[0]!, temp: 24.5 }, workday[1]!], z1)).toBe(false);
  });
});

describe("draftForSelection", () => {
  it("identical days -> shared program", () => {
    const d = draftForSelection(liveWeek(), PRESETS.weekdays, z1);
    expect(d).toEqual({ identical: true, source: "monday", slots: workday });
  });
  it("different days -> first selected day, flagged as not identical", () => {
    const d = draftForSelection(liveWeek(), ["friday", "saturday"], z1);
    expect(d.identical).toBe(false);
    expect(d.source).toBe("friday");
    expect(d.slots).toEqual(workday);
  });
  it("explicit source day within the selection", () => {
    const d = draftForSelection(liveWeek(), [...PRESETS.all], z1, "sunday");
    expect(d.source).toBe("sunday");
    expect(d.slots).toEqual(weekendDay);
  });
  it("source outside the selection is ignored", () => {
    expect(draftForSelection(liveWeek(), ["monday"], z1, "sunday").source).toBe("monday");
  });
  it("draft is a copy", () => {
    const week = liveWeek();
    const d = draftForSelection(week, ["monday"], z1);
    d.slots[0]!.start = "05:00";
    expect(week.monday[0]!.start).toBe("06:30");
  });
  it("nothing selected", () => {
    expect(draftForSelection(liveWeek(), [], z1)).toEqual({ identical: true, source: null, slots: [] });
  });
});

describe("planWrite", () => {
  it("apply weekday program to all days: only the weekend is written", () => {
    const plan = planWrite(liveWeek(), [...PRESETS.all], workday, z1);
    expect(plan.write).toEqual(["saturday", "sunday"]);
    expect(plan.unchanged).toEqual(PRESETS.weekdays);
  });
  it("new program for Mo–Fr writes all five, Monday first", () => {
    const draft = [{ start: "07:00", end: "22:00", temp: 21 }];
    const plan = planWrite(liveWeek(), ["friday", "monday", "wednesday", "tuesday", "thursday"], draft, z1);
    expect(plan.write).toEqual(PRESETS.weekdays);
    expect(plan.unchanged).toEqual([]);
    expect(plan.slots).toEqual(draft);
  });
  it("applyDraft updates only the given days", () => {
    const draft = [{ start: "07:00", end: "22:00", temp: 21 }];
    const next = applyDraft(liveWeek(), ["saturday"], draft, z1);
    expect(next.saturday).toEqual(draft);
    expect(next.sunday).toEqual(weekendDay);
    expect(next.monday).toEqual(workday);
  });
});
