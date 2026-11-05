import { PROGRAMS } from "./model/programs.js";
import type { ProgramId, ProgramSpec } from "./model/types.js";

export type DefaultDays = "all" | "weekdays" | "weekend" | "today";

export interface ProgramConfig {
  id: ProgramId;
  name?: string;
  /** Override the ebusd message prefix, e.g. for a renamed CSV. */
  message_prefix?: string;
}

/** YAML config of the card (snake_case like other HA cards). */
export interface CardConfig {
  type: string;
  title?: string;
  mqtt_prefix?: string;
  circuit?: string;
  topic_template?: string;
  entity_template?: string;
  /** Name of the slot-count message without program prefix; auto-detected when omitted. */
  count_message?: string;
  programs?: (ProgramId | ProgramConfig)[];
  default_days?: DefaultDays;
  show_preview?: boolean;
  accent?: string;
}

export interface ResolvedProgram {
  spec: ProgramSpec;
  name: string;
}

export interface ResolvedConfig {
  title: string;
  prefix: string;
  circuit: string;
  topicTemplate: string;
  entityTemplate: string;
  countMessage: string | null;
  programs: ResolvedProgram[];
  defaultDays: DefaultDays;
  showPreview: boolean;
  accent: string | null;
}

export const DEFAULTS = {
  title: "Weekly schedule",
  prefix: "ebusd",
  circuit: "ctlv2",
  topicTemplate: "{prefix}/{circuit}/{message}/{action}",
  entityTemplate: "sensor.{prefix}_{circuit}_{message}_{field}",
  programs: ["z1", "hwc", "cc"] as ProgramId[],
} as const;

/** Candidate names of the slot-count message, in detection order (PLAN.md §8). */
export const COUNT_MESSAGE_CANDIDATES = ["Timeframes", "Timeslots"] as const;

export const PROGRAM_NAMES: Record<ProgramId, string> = {
  z1: "Zone 1",
  hwc: "Hot water",
  cc: "Circulation",
};

export const PROGRAM_SHORT: Record<ProgramId, string> = {
  z1: "Z1",
  hwc: "HWC",
  cc: "CC",
};

export class ConfigError extends Error {}

export function resolveConfig(config: CardConfig): ResolvedConfig {
  if (!config || typeof config !== "object") throw new ConfigError("Invalid configuration");
  const entries = config.programs ?? DEFAULTS.programs;
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new ConfigError("`programs` must be a non-empty list");
  }
  const seen = new Set<ProgramId>();
  const programs = entries.map((entry): ResolvedProgram => {
    const p: ProgramConfig = typeof entry === "string" ? { id: entry } : entry;
    const base = PROGRAMS[p.id];
    if (!base) {
      throw new ConfigError(`Unknown program "${p.id}" (supported: ${Object.keys(PROGRAMS).join(", ")})`);
    }
    if (seen.has(p.id)) throw new ConfigError(`Program "${p.id}" is listed twice`);
    seen.add(p.id);
    const spec = p.message_prefix ? { ...base, messagePrefix: p.message_prefix } : base;
    return { spec, name: p.name ?? PROGRAM_NAMES[p.id] };
  });
  return {
    title: config.title ?? DEFAULTS.title,
    prefix: config.mqtt_prefix ?? DEFAULTS.prefix,
    circuit: config.circuit ?? DEFAULTS.circuit,
    topicTemplate: config.topic_template ?? DEFAULTS.topicTemplate,
    entityTemplate: config.entity_template ?? DEFAULTS.entityTemplate,
    countMessage: config.count_message ?? null,
    programs,
    defaultDays: config.default_days ?? "weekdays",
    showPreview: config.show_preview ?? true,
    accent: config.accent ?? null,
  };
}

/** Replace `{name}` placeholders; unknown placeholders are left as they are. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => values[key] ?? m);
}

/** HA entity id of one ebusd field sensor. ebusd/HA lower-case the object id. */
export function entityId(cfg: ResolvedConfig, message: string, field: string): string {
  const id = fillTemplate(cfg.entityTemplate, {
    prefix: cfg.prefix,
    circuit: cfg.circuit,
    message,
    field,
  });
  const dot = id.indexOf(".");
  return dot < 0 ? id.toLowerCase() : id.slice(0, dot + 1) + id.slice(dot + 1).toLowerCase();
}

/** MQTT topic for a message; `action` is `set` or `get`. */
export function topic(cfg: ResolvedConfig, message: string, action: "set" | "get"): string {
  return fillTemplate(cfg.topicTemplate, {
    prefix: cfg.prefix,
    circuit: cfg.circuit,
    message,
    action,
  });
}
