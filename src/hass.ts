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
  /**
   * HA's `callService(domain, service, data, target, notifyOnError, returnResponse)`.
   * With `returnResponse`, the service's data is in `response` (actions with `SupportsResponse`).
   */
  callService?: (
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: Record<string, unknown>,
    notifyOnError?: boolean,
    returnResponse?: boolean,
  ) => Promise<unknown>;
}
