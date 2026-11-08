import { PROGRAMS } from "./model/programs.js";
import type { ProgramId, ProgramSpec } from "./model/types.js";
import { PREVIEW_DAYS, type PreviewDays } from "./model/week.js";

export type DefaultDays = "all" | "weekdays" | "weekend" | "today";
export type CardTheme = "brand" | "default";
export const THEMES: readonly CardTheme[] = ["brand", "default"];
export type CardLayout = "auto" | "wide" | "narrow";
export const LAYOUTS: readonly CardLayout[] = ["auto", "wide", "narrow"];
export type CardMode = "edit" | "preview";
export type TempLabels = "auto" | "always" | "never";
export const TEMP_LABELS: readonly TempLabels[] = ["auto", "always", "never"];
export const MODES: readonly CardMode[] = ["edit", "preview"];

export interface ProgramConfig {
  id: ProgramId;
  name?: string;
  /** Override the ebusd message prefix, e.g. for a renamed CSV. */
  message_prefix?: string;
  /** Zones only: entity with the set-back temperature shown in the info text. */
  setback_entity?: string;
}

/** YAML config of the card (snake_case like other HA cards). */
export interface CardConfig {
  type: string;
  /** Card title; default: "Weekly schedule" in the card's language. */
  title?: string;
  /** UI language, e.g. `de`, `en-GB`; default: the HA user's language. */
  language?: string;
  mqtt_prefix?: string;
  circuit?: string;
  topic_template?: string;
  entity_template?: string;
  /** Name of the slot-count message without program prefix; auto-detected when omitted. */
  count_message?: string;
  programs?: (ProgramId | ProgramConfig)[];
  default_days?: DefaultDays;
  show_preview?: boolean;
  /**
   * `brand` (default): the card's own dark look, teal accent, red heating times.
   * `default`: the HA theme, with its primary and accent colour.
   */
  theme?: CardTheme;
  /** `auto` (default): two columns from 720 px card width; `wide` / `narrow` force one. */
  layout?: CardLayout;
  /** `edit` (default) or `preview`: read-only week chart, much smaller. */
  mode?: CardMode;
  /** Preview mode: all programs below each other instead of tabs. */
  stacked?: boolean;
  /**
   * Preview mode: temperature inside long bars. `auto` (default): only when a
   * program has more than one temperature (otherwise it is shown in the heading).
   */
  temp_labels?: TempLabels;
  /** Preview mode: `week` (default), `today`, or `today_tomorrow`. */
  preview_days?: PreviewDays;
  /** Preview mode: the slots of the shown day written out below the chart (default true). */
  preview_label?: boolean;
  /** Override the accent colour with any CSS colour, e.g. `"#e07a1f"`. */
  accent?: string;
  /** Z1 set-back temperature entity (default: the Z1SetbackTemp or Z1NightTemp sensor); other zones set it per program. */
  setback_entity?: string;
  /** Seconds to wait per day for the controller to confirm a write (default 30). */
  verify_timeout?: number;
}

export interface ResolvedProgram {
  spec: ProgramSpec;
  /** Configured name; null = the program's name in the card's language (programName()). */
  name: string | null;
  /** Configured set-back entity; null = derive it from the entity template. */
  setbackEntity: string | null;
}

export interface ResolvedConfig {
  /** null = the default title in the card's language. */
  title: string | null;
  /** null = follow HA's language. */
  language: string | null;
  prefix: string;
  circuit: string;
  topicTemplate: string;
  entityTemplate: string;
  countMessage: string | null;
  programs: ResolvedProgram[];
  defaultDays: DefaultDays;
  showPreview: boolean;
  theme: CardTheme;
  layout: CardLayout;
  mode: CardMode;
  stacked: boolean;
  tempLabels: TempLabels;
  previewDays: PreviewDays;
  previewLabel: boolean;
  /** Custom accent colour; null = the theme's. */
  accent: string | null;
  verifyTimeout: number;
}

export const DEFAULTS = {
  prefix: "ebusd",
  circuit: "ctlv2",
  topicTemplate: "{prefix}/{circuit}/{message}/{action}",
  entityTemplate: "sensor.{prefix}_{circuit}_{message}_{field}",
  programs: ["z1", "hwc", "cc"] as ProgramId[],
} as const;

/**
 * Candidate names of the slot-count message, in detection order. The current
 * ebusd-configuration names it `*Timer_Timeslots`, older generated configs
 * `*Timer_Timeframes`. The current name goes first: after a rename the old
 * entities can linger in Home Assistant (retained discovery) with stale values.
 */
export const COUNT_MESSAGE_CANDIDATES = ["Timeslots", "Timeframes"] as const;

export class ConfigError extends Error {}

export function resolveConfig(config: CardConfig): ResolvedConfig {
  if (!config || typeof config !== "object") throw new ConfigError("Invalid configuration");
  const entries = config.programs ?? DEFAULTS.programs;
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new ConfigError("`programs` must be a non-empty list");
  }
  const theme = config.theme ?? "brand";
  if (!THEMES.includes(theme)) {
    throw new ConfigError(`Unknown theme "${String(theme)}" (supported: ${THEMES.join(", ")})`);
  }
  const layout = config.layout ?? "auto";
  if (!LAYOUTS.includes(layout)) {
    throw new ConfigError(`Unknown layout "${String(layout)}" (supported: ${LAYOUTS.join(", ")})`);
  }
  const mode = config.mode ?? "edit";
  if (!MODES.includes(mode)) {
    throw new ConfigError(`Unknown mode "${String(mode)}" (supported: ${MODES.join(", ")})`);
  }
  const tempLabels = config.temp_labels ?? "auto";
  if (!TEMP_LABELS.includes(tempLabels)) {
    throw new ConfigError(`Unknown temp_labels "${String(tempLabels)}" (supported: ${TEMP_LABELS.join(", ")})`);
  }
  const previewDays = config.preview_days ?? "week";
  if (!PREVIEW_DAYS.includes(previewDays)) {
    throw new ConfigError(`Unknown preview_days "${String(previewDays)}" (supported: ${PREVIEW_DAYS.join(", ")})`);
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
    const setbackEntity = p.setback_entity ?? (p.id === "z1" ? config.setback_entity : undefined) ?? null;
    return { spec, name: p.name ?? null, setbackEntity };
  });
  return {
    title: config.title ?? null,
    language: config.language?.trim() || null,
    prefix: config.mqtt_prefix ?? DEFAULTS.prefix,
    circuit: config.circuit ?? DEFAULTS.circuit,
    topicTemplate: config.topic_template ?? DEFAULTS.topicTemplate,
    entityTemplate: config.entity_template ?? DEFAULTS.entityTemplate,
    countMessage: config.count_message ?? null,
    programs,
    defaultDays: config.default_days ?? "weekdays",
    showPreview: config.show_preview ?? true,
    theme,
    layout,
    mode,
    stacked: config.stacked ?? false,
    tempLabels,
    previewDays,
    previewLabel: config.preview_label ?? true,
    accent: config.accent?.trim() || null,
    verifyTimeout: config.verify_timeout ?? 30,
  };
}

/** Inline CSS variable for a custom accent colour; empty when the theme's is used. */
export function accentStyle(cfg: ResolvedConfig): string {
  return cfg.accent ? `--etp-accent:${cfg.accent}` : "";
}

/**
 * Entity of a zone's set-back temperature ("Absenktemperatur", Z1: register 0x9);
 * null for programs without one. It is a single-value sensor, so the `{field}`
 * part of the template is empty: `sensor.ebusd_ctlv2_z1setbacktemp`. ebusd's discovery
 * creates a `number` instead when the message is also writable and `filter-direction`
 * lets writes through, so each sensor id has a `number.` twin. With `states`, the
 * first candidate that exists wins (`…_z1setbacktemp`, then `…_z1nighttemp`, each
 * sensor before number); without, or when none exists, the first candidate.
 */
export function setbackEntityId(cfg: ResolvedConfig, program: ResolvedProgram, states?: Record<string, unknown>): string | null {
  if (program.setbackEntity) return program.setbackEntity;
  const ids = (program.spec.setbackMessages ?? []).flatMap((msg) => {
    const id = entityId(cfg, msg, "").replace(/_+$/, "");
    return id.startsWith("sensor.") ? [id, `number.${id.slice("sensor.".length)}`] : [id];
  });
  return ids.find((id) => states?.[id] !== undefined) ?? ids[0] ?? null;
}

/** How the set-back temperature is written from the card. */
export type SetbackWrite =
  | { kind: "service"; domain: "number" | "input_number"; entity: string }
  | { kind: "mqtt"; topic: string };

/**
 * Write path for a zone's set-back temperature, or null when the card cannot
 * change it. A `number`/`input_number` entity is set through its own service (so
 * a configured `setback_entity` works too); a derived ebusd sensor is written
 * through the message's MQTT `set` topic, like the time program.
 */
export function setbackWrite(cfg: ResolvedConfig, program: ResolvedProgram, states?: Record<string, unknown>): SetbackWrite | null {
  const id = setbackEntityId(cfg, program, states);
  if (!id) return null;
  const domain = id.slice(0, id.indexOf("."));
  if (domain === "number" || domain === "input_number") return { kind: "service", domain, entity: id };
  if (program.setbackEntity) return null;
  const message = (program.spec.setbackMessages ?? []).find((m) => entityId(cfg, m, "").replace(/_+$/, "") === id);
  return message ? { kind: "mqtt", topic: topic(cfg, message, "set") } : null;
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
