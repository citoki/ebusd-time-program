import { countField, detectCountMessage, FIELD, readProgram } from "../src/adapters/mqtt.js";
import { entityId, type ResolvedConfig } from "../src/config.js";
import type { Hass, HassEntity } from "../src/hass.js";
import { readMessage, writeMessage } from "../src/model/payload.js";
import { MAX_SLOTS, PROGRAMS } from "../src/model/programs.js";
import { DAYS, type Day, type ProgramSpec, type Slot } from "../src/model/types.js";

/**
 * Simulates ebusd + VRC 720 behind HA's `mqtt.publish`, with the behaviour
 * verified on a real VRC 720:
 * - a day is applied only when slots 0…count-1 arrive in order (partial writes are ignored),
 * - written values reach HA only after a `/get` of the count and slot messages.
 */
export interface FakeOptions {
  /** Delay per bus operation in ms (real bus: ~1000). */
  delay?: number;
  /** `<Prefix>Timer_<Day>` write messages that are ACKed but never applied. */
  ignoreWrites?: Set<string>;
  /** Make `mqtt.publish` reject (broker down). */
  failPublish?: boolean;
  /** Make the `vaillant_ebus` actions reject like HA does when the integration is not loaded. */
  noIntegration?: boolean;
}

interface Pending {
  count: number;
  slots: Slot[];
}

export class FakeEbusd {
  states: Record<string, HassEntity>;
  /** Every published message, in order. */
  readonly log: { topic: string; payload: string }[] = [];
  onUpdate: (hass: Hass) => void = () => {};
  private controller = new Map<string, Slot[]>(); // `${prefix}|${day}` -> slots
  private pending = new Map<string, Pending>();
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly cfg: ResolvedConfig,
    initial: Record<string, HassEntity>,
    private readonly opts: FakeOptions = {},
  ) {
    this.states = { ...initial };
    const hass = this.hass();
    for (const spec of Object.values(PROGRAMS)) {
      const read = readProgram(hass, cfg, spec);
      for (const day of DAYS) this.controller.set(key(spec, day), read.days[day] ?? []);
    }
  }

  hass(): Hass {
    return {
      states: this.states,
      language: "en",
      callService: (domain, service, data) => {
        if (domain === "vaillant_ebus") return this.vaillantService(service, data ?? {});
        if (domain !== "mqtt" || service !== "publish") return Promise.reject(new Error("unsupported service"));
        if (this.opts.failPublish) return Promise.reject(new Error("MQTT broker not available"));
        return this.publish(String(data?.topic), String(data?.payload));
      },
    };
  }

  /** Every `vaillant_ebus` action call, in order. */
  readonly serviceLog: { service: string; data: Record<string, unknown> }[] = [];

  /**
   * The Vaillant eBUS integration's `read_time_program` / `write_time_program`, answered
   * from the controller memory like the integration does (HA's `{ context, response }`,
   * errors as `{ code, message }`). A write reads the day back; an ignored write fails.
   */
  private async vaillantService(service: string, data: Record<string, unknown>): Promise<unknown> {
    this.serviceLog.push({ service, data });
    const fail = (code: string, message: string) => Promise.reject({ code, message });
    if (this.opts.noIntegration) return fail("service_not_found", `Action vaillant_ebus.${service} not found.`);
    const spec = Object.values(PROGRAMS).find((p) => p.messagePrefix === data.program);
    if (!spec || detectCountMessage(this.hass(), this.cfg, spec) === null) {
      return fail("home_assistant_error", `${String(data.program)} is not available on this controller`);
    }
    const out = (slots: Slot[]) =>
      slots.map((s) => ({ start: s.start, end: s.end, temperature: spec.temp ? (s.temp ?? null) : null }));
    if (service === "read_time_program") {
      await sleep(this.opts.delay ?? 0);
      const days = Object.fromEntries(DAYS.map((d) => [d, out(this.controllerDay(spec, d))]));
      return { context: {}, response: { program: spec.messagePrefix, circuit: "ctlv2", temperature: !!spec.temp, days, incomplete: [] } };
    }
    if (service !== "write_time_program") return fail("service_not_found", `Action vaillant_ebus.${service} not found.`);
    const written: Record<string, unknown> = {};
    for (const day of (data.days as Day[]) ?? []) {
      const slots = ((data.slots as { start: string; end: string; temperature?: number }[]) ?? []).map((s): Slot => {
        const slot: Slot = { start: s.start, end: s.end };
        if (spec.temp && s.temperature !== undefined) slot.temp = s.temperature;
        return slot;
      });
      await sleep((this.opts.delay ?? 0) * (Math.max(slots.length, 1) + 4)); // slot writes + read-back
      if (!this.opts.ignoreWrites?.has(writeMessage(spec, day))) this.controller.set(key(spec, day), slots);
      const stored = this.controllerDay(spec, day);
      if (JSON.stringify(stored) !== JSON.stringify(slots)) {
        const done = Object.keys(written).join(", ") || "none";
        const name = day[0]!.toUpperCase() + day.slice(1);
        return fail("home_assistant_error", `The controller did not store the new time slots for ${name} (days already written: ${done})`);
      }
      written[day] = out(stored);
    }
    return { context: {}, response: { program: spec.messagePrefix, circuit: "ctlv2", days: written } };
  }

  /** Controller memory (what the VRC 720 has), independent of what HA shows. */
  controllerDay(spec: ProgramSpec, day: Day): Slot[] {
    return this.controller.get(key(spec, day)) ?? [];
  }

  publish(topic: string, payload: string): Promise<void> {
    this.log.push({ topic, payload });
    const parts = topic.split("/");
    const action = parts.at(-1);
    const message = parts.at(-2) ?? "";
    // bus operations are serialised like on the real bus
    const op = this.queue.then(() => sleep(this.opts.delay ?? 0)).then(() => {
      if (action === "set") this.onSet(message, payload);
      else if (action === "get") this.onGet(message);
    });
    this.queue = op;
    return Promise.resolve(); // HA's publish returns as soon as the broker has the message
  }

  private onSet(message: string, payload: string): void {
    if (Object.values(PROGRAMS).some((spec) => spec.setbackMessages?.includes(message))) {
      // single value (set-back temperature): ebusd writes it and publishes the new value
      const id = entityId(this.cfg, message, "").replace(/_+$/, "");
      const old = this.states[id];
      if (old) {
        this.states = { ...this.states, [id]: { ...old, state: Number(payload).toFixed(1) } };
        this.onUpdate(this.hass());
      }
      return;
    }
    const found = findDay(message);
    if (!found) return;
    const [spec, day] = found;
    const [idx, count, start, end, temp] = payload.split(";");
    const i = Number(idx);
    const n = Number(count);
    const k = key(spec, day);
    if (n === 0) {
      this.pending.delete(k);
      if (!this.opts.ignoreWrites?.has(message)) this.controller.set(k, []);
      return;
    }
    const slot: Slot = { start: start!, end: end! };
    if (spec.temp) slot.temp = Number(temp);
    const p = this.pending.get(k);
    if (i === 0) this.pending.set(k, { count: n, slots: [slot] });
    else if (p && p.count === n && p.slots.length === i) p.slots.push(slot);
    else {
      this.pending.delete(k); // out of order: ignored like on the controller
      return;
    }
    const done = this.pending.get(k)!;
    if (done.slots.length === done.count) {
      this.pending.delete(k);
      if (!this.opts.ignoreWrites?.has(message)) this.controller.set(k, done.slots);
    }
  }

  /**
   * Deliver controller values to HA right away, as if ebusd had read these
   * messages (dev page: simulate values arriving). One HA update at the end.
   */
  deliver(messages: readonly string[]): void {
    const next = { ...this.states };
    for (const m of messages) this.applyGet(next, m);
    this.states = next;
    this.onUpdate(this.hass());
  }

  /** Message names ebusd reads for a program: the count message, then each day's slots. */
  readMessages(spec: ProgramSpec): string[] {
    const count = `${spec.messagePrefix}_${detectCountMessage(this.hass(), this.cfg, spec) ?? "Timeframes"}`;
    return [count, ...DAYS.flatMap((day) => Array.from({ length: MAX_SLOTS }, (_, s) => readMessage(spec, day, s)))];
  }

  private onGet(message: string): void {
    this.deliver([message]);
  }

  private applyGet(next: Record<string, HassEntity>, message: string): void {
    for (const spec of Object.values(PROGRAMS)) {
      const countMessage = detectCountMessage(this.hass(), this.cfg, spec);
      if (message === `${spec.messagePrefix}_${countMessage}`) {
        DAYS.forEach((day, i) => {
          set(next, entityId(this.cfg, message, countField(i)), String(this.controllerDay(spec, day).length));
        });
      }
      for (const day of DAYS) {
        for (let s = 0; s < MAX_SLOTS; s++) {
          const msg = readMessage(spec, day, s);
          if (msg !== message) continue;
          const slot = this.controllerDay(spec, day)[s];
          set(next, entityId(this.cfg, msg, FIELD.start), slot?.start ?? "00:00");
          set(next, entityId(this.cfg, msg, FIELD.end), slot?.end ?? "00:00");
          if (spec.temp) {
            set(next, entityId(this.cfg, msg, FIELD.temp), slot?.temp !== undefined ? slot.temp.toFixed(1) : "unknown");
          }
        }
      }
    }
  }
}

const key = (spec: ProgramSpec, day: Day) => `${spec.messagePrefix}|${day}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function findDay(message: string): [ProgramSpec, Day] | null {
  for (const spec of Object.values(PROGRAMS)) {
    for (const day of DAYS) if (writeMessage(spec, day) === message) return [spec, day];
  }
  return null;
}

function set(states: Record<string, HassEntity>, id: string, state: string): void {
  const now = new Date().toISOString();
  states[id] = { entity_id: id, state, attributes: {}, last_changed: now, last_updated: now };
}
