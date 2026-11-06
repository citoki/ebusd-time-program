import "../src/ebusd-time-program-card.js";
import { resolveConfig, type CardConfig } from "../src/config.js";
import type { Hass } from "../src/hass.js";
import { FakeEbusd } from "../test/fake-ebusd.js";
import { sampleStates } from "../test/fixtures/hass-states.js";

// URL params:
//   tab=1  days=saturday,sunday  prefix=vaillant
//   delay=300            ms per simulated bus operation
//   ignore=Z1Timer_Tuesday,...   writes the fake controller ACKs but never applies (-> failure)
//   timeout=5            verify timeout in s (default 30)
//   nomqtt=1             hass without callService
//   theme=default        HA theme instead of the brand look; ha=light fakes a light HA theme
const params = new URLSearchParams(location.search);

const config: CardConfig = { type: "custom:ebusd-time-program-card" };
const prefix = params.get("prefix");
if (prefix) config.mqtt_prefix = prefix;
const theme = params.get("theme");
if (theme) config.theme = theme as NonNullable<CardConfig["theme"]>;
if (params.get("ha") === "light") {
  // a light HA theme with its own primary/accent colours, to see what the card takes over
  Object.entries({
    "--primary-color": "#03a9f4",
    "--accent-color": "#ff9800",
    "--card-background-color": "#ffffff",
    "--secondary-background-color": "#eef0f2",
    "--primary-text-color": "#212121",
    "--secondary-text-color": "#727272",
    "--divider-color": "rgba(0, 0, 0, 0.12)",
  }).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
  document.body.style.background = "#fafafa";
}
const timeout = params.get("timeout");
if (timeout) config.verify_timeout = Number(timeout);

const ebusd = new FakeEbusd(resolveConfig(config), sampleStates(), {
  delay: Number(params.get("delay") ?? 300),
  ignoreWrites: new Set((params.get("ignore") ?? "").split(",").filter(Boolean)),
});
const hassFor = (h: Hass): Hass => (params.get("nomqtt") ? { states: h.states, language: "en" } : h);

const cards: HTMLElement[] = [];
ebusd.onUpdate = (h) => {
  for (const card of cards) (card as unknown as { hass: Hass }).hass = hassFor(h);
};
// log what the card publishes, like the MQTT broker would see it
const publish = ebusd.publish.bind(ebusd);
ebusd.publish = (topic, payload) => {
  console.info(`mqtt.publish ${topic} ← ${payload}`);
  return publish(topic, payload);
};

for (const id of ["narrow", "wide"]) {
  const card = document.createElement("ebusd-time-program-card");
  card.setConfig(config);
  card.hass = hassFor(ebusd.hass());
  cards.push(card);
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
