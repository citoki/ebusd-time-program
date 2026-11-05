import "../src/ebusd-time-program-card.js";
import type { CardConfig } from "../src/config.js";
import type { Hass, HassEntity } from "../src/hass.js";
import states from "../test/fixtures/hass-states.json" with { type: "json" };

// URL params: ?tab=1&days=saturday,sunday&prefix=vaillant
const params = new URLSearchParams(location.search);
const hass: Hass = { states: states as Record<string, HassEntity>, language: "en" };

for (const id of ["narrow", "wide"]) {
  const card = document.createElement("ebusd-time-program-card");
  const config: CardConfig = { type: "custom:ebusd-time-program-card" };
  const prefix = params.get("prefix");
  if (prefix) config.mqtt_prefix = prefix;
  card.setConfig(config);
  card.hass = hass;
  document.getElementById(id)!.append(card);

  const tab = Number(params.get("tab") ?? 0);
  const days = params.get("days");
  void card.updateComplete.then(() => {
    const root = card.shadowRoot!;
    if (tab) root.querySelectorAll<HTMLButtonElement>(".tab")[tab]?.click();
    if (days) {
      // emulate chip clicks: clear, then select requested days
      const want = new Set(days.split(","));
      const chips = root.querySelectorAll<HTMLButtonElement>(".chip");
      const order = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
      chips.forEach((chip, i) => {
        const on = chip.getAttribute("aria-checked") === "true";
        if (on !== want.has(order[i]!)) chip.click();
      });
    }
  });
}
