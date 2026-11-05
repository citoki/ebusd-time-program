import { describe, expect, it } from "vitest";
import { readProgram } from "../src/adapters/mqtt.js";
import { resolveConfig } from "../src/config.js";
import type { Hass, HassEntity } from "../src/hass.js";
import { PROGRAMS } from "../src/model/programs.js";
import type { Day, ProgramSpec, Slot } from "../src/model/types.js";
import { mismatch, restoreItems, retryItems, WriteJob, type JobSnapshot } from "../src/write-job.js";
import { FakeEbusd, type FakeOptions } from "./fake-ebusd.js";
import states from "./fixtures/hass-states.json" with { type: "json" };

const cfg = resolveConfig({ type: "x" });
const { z1, cc } = PROGRAMS;

const newDay: Slot[] = [
  { start: "05:30", end: "08:00", temp: 21 },
  { start: "16:00", end: "22:00", temp: 21.5 },
];

/** Wire a job to the fake: hass updates wake the verify loop, time is real but short. */
function setup(spec: ProgramSpec, days: Day[], slots: Slot[], fake: FakeOptions = {}, timeout = 200) {
  const ebusd = new FakeEbusd(cfg, states as Record<string, HassEntity>, fake);
  let hass: Hass = ebusd.hass();
  let waiters: (() => void)[] = [];
  ebusd.onUpdate = (h) => {
    hass = h;
    const w = waiters;
    waiters = [];
    w.forEach((f) => f());
  };
  const before = readProgram(hass, cfg, spec).days;
  const snapshots: JobSnapshot[] = [];
  const job = new WriteJob(
    {
      kind: "apply",
      program: 0,
      items: days.map((day) => ({ day, slots })),
      previous: Object.fromEntries(days.map((d) => [d, before[d]!])),
    },
    { cfg, spec, countMessage: "Timeframes", verifyTimeoutMs: timeout, rerequestMs: 50 },
    {
      publish: (topic, payload) => hass.callService!("mqtt", "publish", { topic, payload }).then(() => {}),
      readDay: (day) => readProgram(hass, cfg, spec).days[day],
      waitForUpdate: (ms) =>
        new Promise<void>((resolve) => {
          waiters.push(resolve);
          setTimeout(resolve, ms);
        }),
      now: () => Date.now(),
    },
    (s) => snapshots.push(s),
  );
  return { ebusd, job, snapshots, hass: () => hass, before };
}

describe("WriteJob", () => {
  it("writes each day in order, verifies the read-back and ends done", async () => {
    const { ebusd, job, hass, snapshots } = setup(z1, ["monday", "tuesday"], newDay);
    const result = await job.run();
    expect(result.status).toBe("done");
    expect(result.items.map((i) => i.state)).toEqual(["done", "done"]);
    expect(readProgram(hass(), cfg, z1).days.monday).toEqual(newDay);
    expect(readProgram(hass(), cfg, z1).days.wednesday).not.toEqual(newDay); // untouched

    // Monday's writes, then its read requests, then Tuesday
    expect(ebusd.log.slice(0, 5)).toEqual([
      { topic: "ebusd/ctlv2/Z1Timer_Monday/set", payload: "0;2;05:30;08:00;21.0" },
      { topic: "ebusd/ctlv2/Z1Timer_Monday/set", payload: "1;2;16:00;22:00;21.5" },
      { topic: "ebusd/ctlv2/Z1Timer_Timeframes/get", payload: "?1" },
      { topic: "ebusd/ctlv2/Z1Timer_Monday0/get", payload: "?1" },
      { topic: "ebusd/ctlv2/Z1Timer_Monday1/get", payload: "?1" },
    ]);
    expect(ebusd.log[5]!.topic).toBe("ebusd/ctlv2/Z1Timer_Tuesday/set");

    // progress passes through writing -> verifying -> done for each day
    const monday = snapshots.map((s) => s.items[0]!.state);
    expect(monday).toContain("writing");
    expect(monday).toContain("verifying");
  });

  it("writes an empty day as a single message", async () => {
    const { ebusd, job } = setup(z1, ["sunday"], []);
    expect((await job.run()).status).toBe("done");
    expect(ebusd.log.filter((l) => l.topic.endsWith("/set"))).toEqual([
      { topic: "ebusd/ctlv2/Z1Timer_Sunday/set", payload: "0;0;00:00;00:00;0.0" },
    ]);
  });

  it("CC has no temperature field", async () => {
    const { ebusd, job } = setup(cc, ["saturday"], [{ start: "07:00", end: "07:10" }]);
    expect((await job.run()).status).toBe("done");
    expect(ebusd.log[0]).toEqual({ topic: "ebusd/ctlv2/CcTimer_Saturday/set", payload: "0;1;07:00;07:10" });
  });

  it("stops at the first day the controller does not apply, the rest is skipped", async () => {
    const { job, ebusd } = setup(z1, ["monday", "tuesday", "wednesday"], newDay, {
      ignoreWrites: new Set(["Z1Timer_Tuesday"]),
    });
    const result = await job.run();
    expect(result.status).toBe("failed");
    expect(result.items.map((i) => i.state)).toEqual(["done", "failed", "skipped"]);
    expect(result.items[1]!.reason).toEqual({
      code: "slot",
      index: 0,
      actual: "06:30–11:30 25.0 °C",
      expected: "05:30–08:00 21.0 °C",
    });
    expect(ebusd.log.some((l) => l.topic.includes("Wednesday"))).toBe(false);
    // it asked ebusd again while waiting
    expect(ebusd.log.filter((l) => l.topic === "ebusd/ctlv2/Z1Timer_Tuesday0/get").length).toBeGreaterThan(1);
  });

  it("fails with the broker error when publishing is rejected", async () => {
    const { job } = setup(z1, ["monday"], newDay, { failPublish: true });
    const result = await job.run();
    expect(result.status).toBe("failed");
    expect(result.items[0]!.reason).toEqual({ code: "publish", message: "MQTT broker not available" });
  });

  it("cancel takes effect between days only", async () => {
    const { job } = setup(z1, ["monday", "tuesday", "wednesday"], newDay, { delay: 2 });
    const running = job.run();
    job.cancel(); // requested while Monday is being written
    const result = await running;
    expect(result.status).toBe("cancelled");
    expect(result.items.map((i) => i.state)).toEqual(["done", "skipped", "skipped"]);
  });

  it("retry and restore pick the right days", async () => {
    const { job, before } = setup(z1, ["monday", "tuesday", "wednesday"], newDay, {
      ignoreWrites: new Set(["Z1Timer_Tuesday"]),
    });
    const result = await job.run();
    expect(retryItems(result).map((i) => i.day)).toEqual(["tuesday", "wednesday"]);
    expect(restoreItems(result)).toEqual([
      { day: "monday", slots: before.monday },
      { day: "tuesday", slots: before.tuesday },
    ]);
  });

  it("restore writes the previous program back", async () => {
    const first = setup(z1, ["monday"], newDay);
    await first.job.run();
    const ebusd = first.ebusd;
    expect(ebusd.controllerDay(z1, "monday")).toEqual(newDay);
    // second job on the same fake: restore
    let hass = first.hass();
    ebusd.onUpdate = (h) => (hass = h);
    const restore = new WriteJob(
      { kind: "restore", program: 0, items: restoreItems(first.job.snapshot), previous: first.job.snapshot.previous },
      { cfg, spec: z1, countMessage: "Timeframes", verifyTimeoutMs: 200, rerequestMs: 50 },
      {
        publish: (topic, payload) => hass.callService!("mqtt", "publish", { topic, payload }).then(() => {}),
        readDay: (day) => readProgram(hass, cfg, z1).days[day],
        waitForUpdate: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5))),
        now: () => Date.now(),
      },
    );
    expect((await restore.run()).status).toBe("done");
    expect(ebusd.controllerDay(z1, "monday")).toEqual(first.before.monday);
  });
});

describe("mismatch", () => {
  it("reports a different slot count first", () => {
    expect(mismatch([], newDay)).toEqual({ code: "count", actual: 0, expected: 2 });
  });
  it("is a timeout when nothing could be read", () => {
    expect(mismatch(null, newDay)).toEqual({ code: "timeout" });
  });
});
