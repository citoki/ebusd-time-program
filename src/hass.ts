/** The small part of Home Assistant's frontend `hass` object this card uses. */
export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

export interface Hass {
  states: Record<string, HassEntity | undefined>;
  language?: string;
  /** Newer HA: the user's language setting. */
  locale?: { language?: string };
  callService?: (domain: string, service: string, data?: Record<string, unknown>) => Promise<unknown>;
}

export const UNAVAILABLE_STATES = new Set(["unavailable", "unknown"]);
