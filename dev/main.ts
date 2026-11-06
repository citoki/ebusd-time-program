import "../src/ebusd-time-program-card.js";
import { resolveConfig, type CardConfig } from "../src/config.js";
import type { Hass } from "../src/hass.js";
import { FakeEbusd } from "../test/fake-ebusd.js";
import { sampleStates } from "../test/fixtures/hass-states.js";
import { mountScenarioBar } from "./scenarios.js";
import { applyHaTheme, mountSettingsBar } from "./settings-bar.js";

// URL params:
//   tab=1  days=saturday,sunday  prefix=vaillant
//   delay=300            ms per simulated bus operation
//   ignore=Z1Timer_Tuesday,...   writes the fake controller ACKs but never applies (-> failure)
//   timeout=5            verify timeout in s (default 30)
//   nomqtt=1             hass without callService
//   state=startup|weekend|slot|offline|nohwc   start in a sensor-state scenario (toolbar on the page)
//   programs=z1,z2,hwc   programs to show (the fake system has no Z2/Z3 sensors)
//   lang=de|fr|en-GB|…   card language (default: hass.language = en)
//   mode=preview  stacked=1   read-only preview card (stacked: all programs, no tabs)
//   labels=always|never  temperatures inside the bars (preview mode, default auto)
//   layout=wide|narrow   force a layout (default auto)
//   theme=default        HA theme instead of the brand look; ha=light fakes a light HA theme
//   (lang, theme and ha can also be switched with the selectors at the top of the page)
const params = new URLSearchParams(location.search);

const config: CardConfig = { type: "custom:ebusd-time-program-card" };
const prefix = params.get("prefix");
if (prefix) config.mqtt_prefix = prefix;
const theme = params.get("theme");
if (theme) config.theme = theme as NonNullable<CardConfig["theme"]>;
const programs = params.get("programs");
if (programs) config.programs = programs.split(",") as NonNullable<CardConfig["programs"]>;
const lang = params.get("lang");
if (lang) config.language = lang;
const mode = params.get("mode");
if (mode) config.mode = mode as NonNullable<CardConfig["mode"]>;
if (params.get("stacked")) config.stacked = true;
const labels = params.get("labels");
if (labels) config.temp_labels = labels as NonNullable<CardConfig["temp_labels"]>;
const layout = params.get("layout");
if (layout) config.layout = layout as NonNullable<CardConfig["layout"]>;
applyHaTheme(params.get("ha"));
const timeout = params.get("timeout");
if (timeout) config.verify_timeout = Number(timeout);

const ebusd = new FakeEbusd(resolveConfig(config), sampleStates(), {
  delay: Number(params.get("delay") ?? 300),
  ignoreWrites: new Set((params.get("ignore") ?? "").split(",").filter(Boolean)),
});
const hassFor = (h: Hass): Hass => (params.get("nomqtt") ? { states: h.states, language: "en" } : h);

const cards: HTMLElementTagNameMap["ebusd-time-program-card"][] = [];
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

mountScenarioBar(ebusd, resolveConfig(config), params.get("state"));
// language / theme selectors: re-apply the config to both cards (resets their selection)
mountSettingsBar(config, () => cards.forEach((card) => card.setConfig({ ...config })));
