import type { ResolvedConfig } from "../config.js";
import type { Hass } from "../hass.js";
import { DAYS, type Day, type ProgramSpec, type Slot } from "../model/types.js";
import { normalizeSlots } from "../model/week.js";
import { errorMessage } from "../write-job.js";
import type { ProgramRead } from "./mqtt.js";

/**
 * Source `vaillant_ebus`: the time programs come from the Vaillant eBUS integration
 * (github.com/MarkBovee/vaillant-ebus), which talks to ebusd over TCP instead of MQTT.
 * It has no sensor per slot; the card calls its actions instead:
 * - `vaillant_ebus.read_time_program` returns all days of a program,
 * - `vaillant_ebus.write_time_program` writes a day, reads it back and returns what the controller stored.
 */
export const DOMAIN = "vaillant_ebus";
export const READ_SERVICE = "read_time_program";
export const WRITE_SERVICE = "write_time_program";

/** One slot as the integration's actions read and write it. */
export interface ServiceSlot {
  start: string;
  end: string;
  temperature?: number | null;
}

/** Response of `read_time_program`. */
export interface ReadResponse {
  program: string;
  circuit: string;
  temperature: boolean;
  days: Partial<Record<Day, ServiceSlot[]>>;
  /** Days with slots the configuration cannot read (shown as unknown, never rewritten). */
  incomplete?: Day[];
}

/** Response of `write_time_program`: the written days as the controller stored them. */
export interface WriteResponse {
  program: string;
  circuit: string;
  days: Partial<Record<Day, ServiceSlot[]>>;
}

/** Card slots from the integration's slots; the temperature only for programs that have one. */
export function fromService(slots: readonly ServiceSlot[], spec: ProgramSpec): Slot[] {
  return normalizeSlots(
    slots.map((s) => {
      const slot: Slot = { start: s.start, end: s.end };
      if (spec.temp && typeof s.temperature === "number") slot.temp = s.temperature;
      return slot;
    }),
    spec,
  );
}

/** The integration's slots from card slots. */
export function toService(slots: readonly Slot[], spec: ProgramSpec): ServiceSlot[] {
  return normalizeSlots(slots, spec).map((s) =>
    spec.temp && s.temp !== undefined ? { start: s.start, end: s.end, temperature: s.temp } : { start: s.start, end: s.end },
  );
}

/** A program read from a `read_time_program` response. */
export function readFromResponse(response: ReadResponse, spec: ProgramSpec): ProgramRead {
  const incomplete = new Set(response.incomplete ?? []);
  const days = Object.fromEntries(
    DAYS.map((d) => {
      const raw = response.days?.[d];
      return [d, raw && !incomplete.has(d) ? fromService(raw, spec) : null];
    }),
  ) as Record<Day, Slot[] | null>;
  const complete = DAYS.every((d) => days[d] !== null);
  return { status: complete ? "ok" : "loading", days, countMessage: null, missing: [] };
}

/** Readable text of a rejected service call (HA rejects with `{ code, message }`, not an Error). */
export const errorText = errorMessage;

/**
 * Whether an error means the program cannot be read at all (integration missing, too
 * old, or the controller has no such program), rather than a temporary failure.
 */
export function isMissing(error: unknown): boolean {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
  const text = errorText(error);
  return code === "service_not_found" || /not found|not available on this controller|does not support response/i.test(text);
}

const empty = (): Record<Day, Slot[] | null> => Object.fromEntries(DAYS.map((d) => [d, null])) as Record<Day, Slot[] | null>;

/** The read shown while a program has not been read yet. */
export const loadingRead = (): ProgramRead => ({ status: "loading", days: empty(), countMessage: null, missing: [] });

/** A program read after a failed read; `previous` keeps the last known days on a temporary failure. */
export function errorRead(error: unknown, spec: ProgramSpec, previous?: ProgramRead): ProgramRead {
  if (isMissing(error)) {
    return {
      status: "missing",
      days: empty(),
      countMessage: null,
      missing: [`${DOMAIN}.${READ_SERVICE} (${spec.messagePrefix}): ${errorText(error)}`],
    };
  }
  return { status: "offline", days: previous?.days ?? empty(), countMessage: null, missing: [] };
}

/** Service data shared by both actions. */
function baseData(cfg: ResolvedConfig, spec: ProgramSpec): Record<string, unknown> {
  const data: Record<string, unknown> = { program: spec.messagePrefix };
  if (cfg.entryId) data.entry_id = cfg.entryId;
  return data;
}

/** `response` of HA's callService result (`{ context, response }`). */
function responseOf<T>(result: unknown): T {
  const response = result && typeof result === "object" && "response" in result ? (result as { response: unknown }).response : undefined;
  if (!response || typeof response !== "object") throw new Error("The action returned no data (Vaillant eBUS too old?)");
  return response as T;
}

/** Call `read_time_program` for one program. */
export async function readProgramService(hass: Hass, cfg: ResolvedConfig, spec: ProgramSpec): Promise<ProgramRead> {
  if (!hass.callService) throw new Error("This Home Assistant connection cannot call actions");
  const result = await hass.callService(DOMAIN, READ_SERVICE, baseData(cfg, spec), undefined, false, true);
  return readFromResponse(responseOf<ReadResponse>(result), spec);
}

/**
 * Call `write_time_program` for one day. Resolves with the slots the controller stored
 * (the integration reads the day back); rejects when ebusd refused a write or the
 * controller did not store the slots.
 */
export async function writeDayService(hass: Hass, cfg: ResolvedConfig, spec: ProgramSpec, day: Day, slots: readonly Slot[]): Promise<Slot[]> {
  if (!hass.callService) throw new Error("This Home Assistant connection cannot call actions");
  const data = { ...baseData(cfg, spec), days: [day], slots: toService(slots, spec) };
  const result = await hass.callService(DOMAIN, WRITE_SERVICE, data, undefined, false, true);
  const stored = responseOf<WriteResponse>(result).days?.[day];
  if (!stored) throw new Error(`The action did not report ${day}`);
  return fromService(stored, spec);
}

/**
 * Program reads shared by all cards on the page: a preview and an edit card of the same
 * program read it once, and a write updates both.
 */
export class ServiceStore {
  /** `at`: time of the last finished read, null before the first one. */
  private entries = new Map<string, { read: ProgramRead; at: number | null; pending: Promise<void> | null }>();
  private listeners = new Set<() => void>();
  /** Bumped on every change, for cheap change detection in the cards. */
  version = 0;

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get(cfg: ResolvedConfig, spec: ProgramSpec): ProgramRead {
    return this.entries.get(storeKey(cfg, spec))?.read ?? loadingRead();
  }

  /**
   * Read a program unless a read is running or the last one is younger than `maxAgeMs`
   * (after a failed read: younger than RETRY_MS at most).
   */
  load(hass: Hass, cfg: ResolvedConfig, spec: ProgramSpec, maxAgeMs: number, now = Date.now()): Promise<void> {
    const key = storeKey(cfg, spec);
    const entry = this.entries.get(key);
    if (entry?.pending) return entry.pending;
    if (entry && entry.at !== null) {
      const failed = entry.read.status === "offline" || entry.read.status === "missing";
      if (now - entry.at < (failed ? Math.min(maxAgeMs, RETRY_MS) : maxAgeMs)) return Promise.resolve();
    }
    const pending = readProgramService(hass, cfg, spec)
      .then((read) => this.set(key, read, now))
      .catch((error: unknown) => {
        console.warn(`ebusd-time-program-card: reading ${spec.messagePrefix} failed:`, errorText(error));
        this.set(key, errorRead(error, spec, this.entries.get(key)?.read), now);
      });
    this.entries.set(key, { read: entry?.read ?? loadingRead(), at: entry?.at ?? null, pending });
    return pending;
  }

  /** Take over a day the controller confirmed after a write. */
  setDay(cfg: ResolvedConfig, spec: ProgramSpec, day: Day, slots: Slot[]): void {
    const key = storeKey(cfg, spec);
    const entry = this.entries.get(key);
    const read = entry?.read ?? loadingRead();
    const days = { ...read.days, [day]: slots };
    const status = DAYS.every((d) => days[d] !== null) ? "ok" : read.status;
    this.entries.set(key, { read: { ...read, days, status }, at: entry?.at ?? null, pending: entry?.pending ?? null });
    this.changed();
  }

  /** Forget everything (tests). */
  clear(): void {
    this.entries.clear();
    this.changed();
  }

  private set(key: string, read: ProgramRead, at: number): void {
    this.entries.set(key, { read, at, pending: null });
    this.changed();
  }

  private changed(): void {
    this.version++;
    this.listeners.forEach((l) => l());
  }
}

/** Retry a failed read after this long, whatever the refresh interval. */
export const RETRY_MS = 30_000;

const storeKey = (cfg: ResolvedConfig, spec: ProgramSpec) => `${cfg.entryId ?? ""}|${spec.messagePrefix}`;

/** The page-wide store. */
export const serviceStore = new ServiceStore();
