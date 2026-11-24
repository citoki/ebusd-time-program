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
//   source=vaillant_ebus|arotherm_genia_ebusd  read/write through the (fake) integration's actions instead of MQTT
//   refresh=60           service sources: seconds between reads (default 300)
//   state=startup|weekend|slot|offline|nohwc   start in a sensor-state scenario (toolbar on the page)
//   programs=z1,z2,hwc   programs to show (the fake system has no Z2/Z3 sensors)
//   lang=de|fr|en-GB|…   card language (default: hass.language = en)
//   mode=preview  stacked=1   read-only preview card (stacked: all programs, no tabs);
//                        without mode=preview three preview cards (week, today + tomorrow, today) are shown next to the edit cards
//   labels=always|never  temperatures inside the bars (preview mode, default auto)
//   range=today|today_tomorrow  preview rows (default week)   nolabel=1  hide the detail line
//   layout=wide|narrow   force a layout (default auto)
//   theme=default        HA theme instead of the vaillant look; theme=saunier-duval light red look; ha=light fakes a light HA theme
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
const range = params.get("range");
if (range) config.preview_days = range as NonNullable<CardConfig["preview_days"]>;
if (params.get("nolabel")) config.preview_label = false;
const layout = params.get("layout");
if (layout) config.layout = layout as NonNullable<CardConfig["layout"]>;
applyHaTheme(params.get("ha"));
const source = params.get("source");
if (source) config.source = source as NonNullable<CardConfig["source"]>;
const refresh = params.get("refresh");
if (refresh) config.refresh_interval = Number(refresh);
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
// log the integration's actions the card calls
const hassOf = ebusd.hass.bind(ebusd);
ebusd.hass = () => {
  const hass = hassOf();
  return {
    ...hass,
    callService: (domain, name, data, ...rest) => {
      if (domain === "vaillant_ebus" || domain === "arotherm_genia_ebusd") console.info(`${domain}.${name}`, data);
      return hass.callService!(domain, name, data, ...rest);
    },
  };
};
// log what the card publishes, like the MQTT broker would see it
const publish = ebusd.publish.bind(ebusd);
ebusd.publish = (topic, payload) => {
  console.info(`mqtt.publish ${topic} ← ${payload}`);
  return publish(topic, payload);
};

// Edit mode: also show a preview card next to the edit cards (same fake controller, so writes show up there).
const withPreview = config.mode !== "preview";
const PREVIEW_FRAMES: Record<string, { title: string; config: Partial<CardConfig> }> = {
  preview: { title: "Preview (400 px)", config: { mode: "preview" } },
  "preview-today": { title: "Preview today + tomorrow (400 px)", config: { mode: "preview", preview_days: "today_tomorrow" } },
  "preview-today-only": { title: "Preview today (400 px)", config: { mode: "preview", preview_days: "today" } },
};
const configFor = (id: string): CardConfig => ({ ...config, ...PREVIEW_FRAMES[id]?.config });
if (withPreview) {
  // stacked in one column next to the edit cards
  const column = document.createElement("div");
  column.className = "preview-column";
  for (const [id, { title }] of Object.entries(PREVIEW_FRAMES)) {
    const frame = document.createElement("div");
    frame.className = "frame preview";
    frame.id = id;
    frame.innerHTML = `<h1>${title}</h1>`;
    column.append(frame);
  }
  document.body.append(column);
}

const frameIds = withPreview ? ["narrow", "wide", ...Object.keys(PREVIEW_FRAMES)] : ["narrow", "wide"];
for (const id of frameIds) {
  const card = document.createElement("ebusd-time-program-card");
  card.dataset.frame = id;
  card.setConfig(configFor(id));
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
// language / theme selectors: re-apply the config to all cards (resets their selection)
mountSettingsBar(config, () => cards.forEach((card) => card.setConfig(configFor(card.dataset.frame!))));
