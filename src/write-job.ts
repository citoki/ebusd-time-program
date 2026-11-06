import { formatTemp } from "./i18n/format.js";
import { topic, type ResolvedConfig } from "./config.js";
import { buildDayPayloads, readMessage, writeMessage } from "./model/payload.js";
import type { Day, ProgramSpec, Slot } from "./model/types.js";
import { normalizeSlots, sameSlots } from "./model/week.js";

/**
 * Sequential writer: one day after the other, all slots of a
 * day in order, then a read-back that must show the written values before the
 * next day starts. The controller ACKs partial or rejected writes without
 * applying them, so the read-back is the only real confirmation.
 */

export type DayState = "queued" | "writing" | "verifying" | "done" | "failed" | "skipped";
export type JobKind = "apply" | "retry" | "restore";
export type JobStatus = "running" | "done" | "failed" | "cancelled";

export type FailReason =
  | { code: "count"; actual: number; expected: number }
  | { code: "slot"; index: number; actual: string; expected: string }
  | { code: "timeout" }
  | { code: "publish"; message: string };

export interface JobItem {
  day: Day;
  /** Normalised slots this day must have afterwards. */
  slots: Slot[];
  state: DayState;
  reason?: FailReason;
}

export interface JobSnapshot {
  kind: JobKind;
  /** Index of the program (tab) being written. */
  program: number;
  items: JobItem[];
  status: JobStatus;
  cancelRequested: boolean;
  /** Controller values before the first job of this edit, for "Restore previous". */
  previous: Partial<Record<Day, Slot[]>>;
}

export interface JobDeps {
  publish(topic: string, payload: string): Promise<void>;
  /** Current controller values of one day as HA shows them (null = unknown). */
  readDay(day: Day): Slot[] | null;
  /** Resolves on the next hass update, or after `ms` at the latest. */
  waitForUpdate(ms: number): Promise<void>;
  now(): number;
}

export interface JobOptions {
  cfg: ResolvedConfig;
  spec: ProgramSpec;
  /** Count message name without prefix, e.g. `Timeframes`. */
  countMessage: string;
  /** Max. time per day to see the written values in HA (default 30 s). */
  verifyTimeoutMs?: number;
  /** Ask ebusd to read again when nothing matched for this long (default 8 s). */
  rerequestMs?: number;
}

export class WriteJob {
  private state: JobSnapshot;

  constructor(
    init: { kind: JobKind; program: number; items: { day: Day; slots: Slot[] }[]; previous: JobSnapshot["previous"] },
    private readonly opts: JobOptions,
    private readonly deps: JobDeps,
    private readonly onChange: (snapshot: JobSnapshot) => void = () => {},
  ) {
    this.state = {
      kind: init.kind,
      program: init.program,
      items: init.items.map((i) => ({ day: i.day, slots: normalizeSlots(i.slots, opts.spec), state: "queued" })),
      status: "running",
      cancelRequested: false,
      previous: init.previous,
    };
  }

  get snapshot(): JobSnapshot {
    return this.state;
  }

  /** Stop after the current day; a day is never left half-written. */
  cancel(): void {
    if (this.state.status === "running") this.update({ cancelRequested: true });
  }

  async run(): Promise<JobSnapshot> {
    for (let i = 0; i < this.state.items.length; i++) {
      if (this.state.cancelRequested) {
        this.setRemaining(i, "skipped");
        return this.update({ status: "cancelled" });
      }
      const ok = await this.writeDay(i);
      if (!ok) {
        this.setRemaining(i + 1, "skipped");
        return this.update({ status: "failed" });
      }
    }
    return this.update({ status: "done" });
  }

  private async writeDay(i: number): Promise<boolean> {
    const { cfg, spec } = this.opts;
    const item = this.state.items[i]!;
    this.setItem(i, { state: "writing" });
    try {
      for (const payload of buildDayPayloads(spec, item.slots)) {
        await this.deps.publish(topic(cfg, writeMessage(spec, item.day), "set"), payload);
      }
      await this.requestRead(item);
    } catch (e) {
      this.setItem(i, { state: "failed", reason: { code: "publish", message: e instanceof Error ? e.message : String(e) } });
      return false;
    }

    this.setItem(i, { state: "verifying" });
    const timeout = this.opts.verifyTimeoutMs ?? 30_000;
    const rerequest = this.opts.rerequestMs ?? 8_000;
    const start = this.deps.now();
    let lastRequest = start;
    for (;;) {
      const actual = this.deps.readDay(item.day);
      if (actual !== null && sameSlots(actual, item.slots, spec)) {
        this.setItem(i, { state: "done" });
        return true;
      }
      const now = this.deps.now();
      if (now - start >= timeout) {
        this.setItem(i, { state: "failed", reason: mismatch(actual, item.slots) });
        return false;
      }
      if (now - lastRequest >= rerequest) {
        lastRequest = now;
        await this.requestRead(item).catch(() => {}); // a failed re-request just waits for the timeout
      }
      await this.deps.waitForUpdate(Math.min(timeout - (now - start), rerequest));
    }
  }

  /** `…/get ?1` for the count message and every slot that must be read. */
  private async requestRead(item: JobItem): Promise<void> {
    const { cfg, spec, countMessage } = this.opts;
    await this.deps.publish(topic(cfg, `${spec.messagePrefix}_${countMessage}`, "get"), "?1");
    for (let s = 0; s < item.slots.length; s++) {
      await this.deps.publish(topic(cfg, readMessage(spec, item.day, s), "get"), "?1");
    }
  }

  private setItem(i: number, patch: Partial<JobItem>): void {
    const items = this.state.items.map((it, j) => (j === i ? { ...it, ...patch } : it));
    this.update({ items });
  }

  private setRemaining(from: number, state: DayState): void {
    const items = this.state.items.map((it, j) => (j >= from && it.state === "queued" ? { ...it, state } : it));
    this.update({ items });
  }

  private update(patch: Partial<JobSnapshot>): JobSnapshot {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
    return this.state;
  }
}

const range = (s: Slot) => `${s.start}–${s.end}${s.temp !== undefined ? ` ${formatTemp(s.temp)} °C` : ""}`;

/** Describe why the read-back does not match (first difference). */
export function mismatch(actual: Slot[] | null, expected: readonly Slot[]): FailReason {
  if (actual === null) return { code: "timeout" };
  if (actual.length !== expected.length) return { code: "count", actual: actual.length, expected: expected.length };
  const a = [...actual].sort((x, y) => x.start.localeCompare(y.start));
  for (let i = 0; i < expected.length; i++) {
    const e = expected[i]!;
    const got = a[i]!;
    if (got.start !== e.start || got.end !== e.end || got.temp !== e.temp) {
      return { code: "slot", index: i, actual: range(got), expected: range(e) };
    }
  }
  return { code: "timeout" };
}

/** Days a retry should write again: everything that did not get confirmed. */
export function retryItems(job: JobSnapshot): { day: Day; slots: Slot[] }[] {
  return job.items.filter((i) => i.state !== "done").map(({ day, slots }) => ({ day, slots }));
}

/** Days "Restore previous" writes back: everything that was (or may have been) touched. */
export function restoreItems(job: JobSnapshot): { day: Day; slots: Slot[] }[] {
  return job.items
    .filter((i) => i.state === "done" || i.state === "failed")
    .flatMap(({ day }) => {
      const slots = job.previous[day];
      return slots ? [{ day, slots }] : [];
    });
}
