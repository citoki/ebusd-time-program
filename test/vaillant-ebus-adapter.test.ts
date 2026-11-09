import { afterEach, describe, expect, it, vi } from "vitest";
import {
  errorRead,
  fromService,
  readFromResponse,
  readProgramService,
  RETRY_MS,
  ServiceStore,
  toService,
  writeDayService,
  type ReadResponse,
} from "../src/adapters/vaillant-ebus.js";
import { resolveConfig } from "../src/config.js";
import type { Hass } from "../src/hass.js";
import { PROGRAMS } from "../src/model/programs.js";
import { DAYS } from "../src/model/types.js";
import { WriteJob, type JobDeps } from "../src/write-job.js";
import { FakeEbusd } from "./fake-ebusd.js";
import { sampleStates } from "./fixtures/hass-states.js";

const cfg = resolveConfig({ type: "x", source: "vaillant_ebus" });
const z1 = PROGRAMS.z1;
const cc = PROGRAMS.cc;

const week = (days: ReadResponse["days"], incomplete: ReadResponse["incomplete"] = []): ReadResponse => ({
  program: "Z1Timer",
  circuit: "ctlv2",
  temperature: true,
  days: { ...Object.fromEntries(DAYS.map((d) => [d, []])), ...days },
  incomplete,
});

describe("slot conversion", () => {
  it("takes the temperature only for programs that have one, sorted by start", () => {
    const raw = [
      { start: "17:00", end: "24:00", temperature: 20.5 },
      { start: "06:00", end: "08:00", temperature: 21 },
    ];
    expect(fromService(raw, z1)).toEqual([
      { start: "06:00", end: "08:00", temp: 21 },
      { start: "17:00", end: "24:00", temp: 20.5 },
    ]);
    expect(fromService(raw, cc)).toEqual([
      { start: "06:00", end: "08:00" },
      { start: "17:00", end: "24:00" },
    ]);
  });

  it("sends `temperature` only for programs with one", () => {
    expect(toService([{ start: "06:00", end: "08:00", temp: 21 }], z1)).toEqual([{ start: "06:00", end: "08:00", temperature: 21 }]);
    expect(toService([{ start: "06:00", end: "08:00", temp: 21 }], cc)).toEqual([{ start: "06:00", end: "08:00" }]);
  });
});

describe("reading", () => {
  it("builds a complete read from the action's response", () => {
    const read = readFromResponse(week({ monday: [{ start: "06:00", end: "22:00", temperature: 21 }] }), z1);
    expect(read.status).toBe("ok");
    expect(read.days.monday).toEqual([{ start: "06:00", end: "22:00", temp: 21 }]);
    expect(read.days.sunday).toEqual([]);
  });

  it("shows incomplete days as unknown (never as empty, so they are not overwritten)", () => {
    const read = readFromResponse(week({ tuesday: [{ start: "03:00", end: "03:10" }] }, ["tuesday"]), z1);
    expect(read.status).toBe("loading");
    expect(read.days.tuesday).toBeNull();
  });

  it("tells a missing integration or program apart from a temporary failure", () => {
    const previous = readFromResponse(week({ monday: [{ start: "06:00", end: "22:00", temperature: 21 }] }), z1);
    const missing = errorRead({ code: "service_not_found", message: "Action vaillant_ebus.read_time_program not found." }, z1);
    expect(missing.status).toBe("missing");
    expect(missing.missing[0]).toContain("vaillant_ebus.read_time_program (Z1Timer)");
    expect(errorRead({ code: "home_assistant_error", message: "Z3Timer is not available on this controller" }, z1).status).toBe(
      "missing",
    );
    const offline = errorRead({ code: "home_assistant_error", message: "Could not read Z1Timer_Monday0" }, z1, previous);
    expect(offline.status).toBe("offline");
    expect(offline.days.monday).toEqual(previous.days.monday); // last known values stay visible
  });

  it("calls the read action with a response and the configured entry", async () => {
    const callService = vi.fn().mockResolvedValue({ context: {}, response: week({}) });
    const hass: Hass = { states: {}, callService };
    await readProgramService(hass, resolveConfig({ type: "x", source: "vaillant_ebus", entry_id: "abc" }), z1);
    expect(callService).toHaveBeenCalledWith("vaillant_ebus", "read_time_program", { program: "Z1Timer", entry_id: "abc" }, undefined, false, true);
  });

  it("rejects a response without data (integration too old)", async () => {
    const hass: Hass = { states: {}, callService: vi.fn().mockResolvedValue({ context: {} }) };
    await expect(readProgramService(hass, cfg, z1)).rejects.toThrow(/no data/);
  });
});

describe("shared store", () => {
  const store = new ServiceStore();
  afterEach(() => store.clear());

  it("reads once for several cards and again only when the read is older than the interval", async () => {
    const callService = vi.fn().mockResolvedValue({ context: {}, response: week({}) });
    const hass: Hass = { states: {}, callService };
    await Promise.all([store.load(hass, cfg, z1, 300_000, 0), store.load(hass, cfg, z1, 300_000, 0)]);
    await store.load(hass, cfg, z1, 300_000, 299_000);
    expect(callService).toHaveBeenCalledTimes(1);
    expect(store.get(cfg, z1).status).toBe("ok");
    await store.load(hass, cfg, z1, 300_000, 300_000);
    expect(callService).toHaveBeenCalledTimes(2);
  });

  it("retries a failed read sooner than the interval", async () => {
    const callService = vi.fn().mockRejectedValue({ code: "home_assistant_error", message: "ebusd not connected" });
    const hass: Hass = { states: {}, callService };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await store.load(hass, cfg, z1, 300_000, 0);
    expect(store.get(cfg, z1).status).toBe("offline");
    await store.load(hass, cfg, z1, 300_000, RETRY_MS - 1);
    expect(callService).toHaveBeenCalledTimes(1);
    await store.load(hass, cfg, z1, 300_000, RETRY_MS);
    expect(callService).toHaveBeenCalledTimes(2);
  });

  it("takes over a written day and tells the cards", async () => {
    const hass: Hass = { states: {}, callService: vi.fn().mockResolvedValue({ context: {}, response: week({}) }) };
    await store.load(hass, cfg, z1, 300_000, 0);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.setDay(cfg, z1, "monday", [{ start: "06:00", end: "08:00", temp: 21 }]);
    expect(store.get(cfg, z1).days.monday).toEqual([{ start: "06:00", end: "08:00", temp: 21 }]);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

describe("writing through the action", () => {
  const deps = (writeDay: JobDeps["writeDay"]): JobDeps => ({
    publish: () => Promise.reject(new Error("must not publish")),
    writeDay,
    readDay: () => null,
    waitForUpdate: () => Promise.resolve(),
    now: () => 0,
  });
  const job = (writeDay: JobDeps["writeDay"]) =>
    new WriteJob(
      {
        kind: "apply",
        program: 0,
        items: [
          { day: "monday", slots: [{ start: "06:00", end: "08:00", temp: 21 }] },
          { day: "tuesday", slots: [{ start: "06:00", end: "08:00", temp: 21 }] },
        ],
        previous: {},
      },
      { cfg, spec: z1, countMessage: "Timeframes" },
      deps(writeDay),
    );

  it("writes day after day and confirms with the stored slots", async () => {
    const writeDay = vi.fn(async (_day, slots) => slots);
    const result = await job(writeDay).run();
    expect(result.status).toBe("done");
    expect(writeDay.mock.calls.map((c) => c[0])).toEqual(["monday", "tuesday"]);
  });

  it("stops at a day the integration reports as failed", async () => {
    const result = await job(async (day, slots) => {
      if (day === "tuesday") throw { code: "home_assistant_error", message: "The controller did not store the new time slots for Tuesday" };
      return slots;
    }).run();
    expect(result.status).toBe("failed");
    expect(result.items[1]).toMatchObject({ state: "failed", reason: { code: "service", message: expect.stringContaining("did not store") } });
  });

  it("fails a day whose stored slots differ from the request", async () => {
    const result = await job(async () => [{ start: "06:00", end: "08:00", temp: 20 }]).run();
    expect(result.items[0]).toMatchObject({ state: "failed", reason: { code: "slot", index: 0 } });
    expect(result.items[1]!.state).toBe("skipped");
  });

  it("sends a day to the fake integration and gets the stored day back", async () => {
    const ebusd = new FakeEbusd(cfg, sampleStates());
    const slots = [
      { start: "17:00", end: "24:00", temp: 20.5 },
      { start: "06:00", end: "08:00", temp: 21 },
    ];
    const stored = await writeDayService(ebusd.hass(), cfg, z1, "saturday", slots);
    expect(stored).toEqual([slots[1], slots[0]]);
    expect(ebusd.controllerDay(z1, "saturday")).toEqual(stored);
    expect(ebusd.serviceLog.at(-1)).toEqual({
      service: "write_time_program",
      data: {
        program: "Z1Timer",
        days: ["saturday"],
        slots: [
          { start: "06:00", end: "08:00", temperature: 21 },
          { start: "17:00", end: "24:00", temperature: 20.5 },
        ],
      },
    });
  });
});
