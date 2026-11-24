import { describe, expect, it } from "vitest";
import type { ProgramRead } from "../src/adapters/mqtt.js";
import { heldDays, stableRead } from "../src/held-days.js";
import { DAYS, type Day, type Slot } from "../src/model/types.js";

const OLD: Slot[] = [{ start: "06:00", end: "08:00", temp: 21 }];
const NEW: Slot[] = [...OLD, { start: "23:00", end: "24:00", temp: 21 }];

const read = (status: ProgramRead["status"], over: Partial<Record<Day, Slot[] | null>> = {}): ProgramRead => ({
  status,
  days: { ...(Object.fromEntries(DAYS.map((d) => [d, OLD])) as Record<Day, Slot[]>), ...over },
  countMessage: "Timeslots",
  missing: [],
});

describe("stableRead", () => {
  it("shows held days with their value from before the job", () => {
    const r = stableRead(read("ok", { monday: NEW }), { monday: OLD }, undefined);
    expect(r.days.monday).toEqual(OLD);
  });

  it("keeps the last value of a day that is briefly unreadable, and reports ok", () => {
    const last = read("ok").days;
    const r = stableRead(read("loading", { tuesday: null }), {}, last);
    expect(r.days.tuesday).toEqual(OLD);
    expect(r.status).toBe("ok");
  });

  it("still loads when there is no earlier value", () => {
    const r = stableRead(read("loading", { tuesday: null }), {}, undefined);
    expect(r.days.tuesday).toBeNull();
    expect(r.status).toBe("loading");
  });

  it("does not keep old values while offline", () => {
    const r = stableRead(read("offline", { tuesday: null }), {}, read("ok").days);
    expect(r.days.tuesday).toBeNull();
    expect(r.status).toBe("offline");
  });

  it("takes new values once a day is readable again", () => {
    const r = stableRead(read("ok", { monday: NEW }), {}, read("ok").days);
    expect(r.days.monday).toEqual(NEW);
  });
});

describe("heldDays", () => {
  it("holds days per program and notifies on change", () => {
    let calls = 0;
    const off = heldDays.subscribe(() => calls++);
    const v = heldDays.version;
    heldDays.set("a", { monday: OLD });
    expect(heldDays.get("a")).toEqual({ monday: OLD });
    expect(heldDays.get("b")).toEqual({});
    heldDays.set(null);
    expect(heldDays.get("a")).toEqual({});
    expect(heldDays.version).toBe(v + 2);
    expect(calls).toBe(2);
    off();
  });
});
