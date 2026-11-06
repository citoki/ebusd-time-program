import { programEntityIds } from "../src/adapters/mqtt.js";
import { entityId, type ResolvedConfig } from "../src/config.js";
import type { HassEntity } from "../src/hass.js";
import { readMessage } from "../src/model/payload.js";
import { MAX_SLOTS, PROGRAMS } from "../src/model/programs.js";
import type { Day, ProgramSpec } from "../src/model/types.js";
import type { FakeEbusd } from "../test/fake-ebusd.js";
import { sampleStates } from "../test/fixtures/hass-states.js";

/**
 * Dev page only: switch the fake HA states between the situations the card
 * meets on a real system (ebusd still reading, sensors unavailable, entities
 * not discovered). The fake controller keeps its program, so "All values" or
 * a write's read-back brings the real values back.
 */
export interface Scenario {
  id: string;
  label: string;
  title: string;
  run: (ebusd: FakeEbusd, cfg: ResolvedConfig) => void;
}

const SPECS = Object.values(PROGRAMS);
let timer: ReturnType<typeof setInterval> | undefined;
const stopTimer = () => {
  clearInterval(timer);
  timer = undefined;
};

/** Every slot and count sensor of a program set to `state`. */
function setAll(states: Record<string, HassEntity>, cfg: ResolvedConfig, spec: ProgramSpec, state: string) {
  for (const id of programEntityIds(cfg, spec, "Timeframes")) {
    if (states[id]) states[id] = { ...states[id]!, state };
  }
}

/** The slot sensors of some days (count stays known), like ebusd not having read them yet. */
function setDays(states: Record<string, HassEntity>, cfg: ResolvedConfig, spec: ProgramSpec, days: Day[], state: string) {
  for (const day of days) {
    for (let s = 0; s < MAX_SLOTS; s++) {
      const msg = readMessage(spec, day, s);
      for (const field of ["htm", "htm_1", "slottemp"]) {
        const id = entityId(cfg, msg, field);
        if (states[id]) states[id] = { ...states[id]!, state };
      }
    }
  }
}

/** Replace HA's states and notify the cards. */
function apply(ebusd: FakeEbusd, edit: (states: Record<string, HassEntity>) => void) {
  const next = { ...ebusd.states };
  edit(next);
  ebusd.states = next;
  ebusd.onUpdate(ebusd.hass());
}

/** All entities exist again and show what the controller has. */
function allValues(ebusd: FakeEbusd) {
  stopTimer();
  // removed (not discovered) entities come back first, then get the controller's values
  ebusd.states = { ...sampleStates(), ...ebusd.states };
  ebusd.deliver(SPECS.flatMap((spec) => ebusd.readMessages(spec)));
}

export const SCENARIOS: Scenario[] = [
  {
    id: "ok",
    label: "All values",
    title: "Every sensor has a value (what the controller has)",
    run: (ebusd) => allValues(ebusd),
  },
  {
    id: "startup",
    label: "ebusd starting",
    title: "All values unknown, then ebusd reads one message every 0.3 s",
    run: (ebusd, cfg) => {
      allValues(ebusd);
      apply(ebusd, (s) => SPECS.forEach((spec) => setAll(s, cfg, spec, "unknown")));
      const queue = SPECS.flatMap((spec) => ebusd.readMessages(spec));
      timer = setInterval(() => {
        const next = queue.shift();
        if (next) ebusd.deliver([next]);
        else stopTimer();
      }, 300);
    },
  },
  {
    id: "weekend",
    label: "Z1 Sa/Su not read",
    title: "Z1 Saturday and Sunday slots still unknown, all other days complete",
    run: (ebusd, cfg) => {
      allValues(ebusd);
      apply(ebusd, (s) => setDays(s, cfg, PROGRAMS.z1, ["saturday", "sunday"], "unknown"));
    },
  },
  {
    id: "slot",
    label: "HWC Tu temp unavailable",
    title: "One sensor unavailable: the temperature of HWC Tuesday slot 1",
    run: (ebusd, cfg) => {
      allValues(ebusd);
      apply(ebusd, (s) => {
        const id = entityId(cfg, readMessage(PROGRAMS.hwc, "tuesday", 0), "slottemp");
        s[id] = { ...s[id]!, state: "unavailable" };
      });
    },
  },
  {
    id: "offline",
    label: "ebusd offline",
    title: "Every program sensor unavailable (ebusd add-on stopped)",
    run: (ebusd, cfg) => {
      allValues(ebusd);
      apply(ebusd, (s) => SPECS.forEach((spec) => setAll(s, cfg, spec, "unavailable")));
    },
  },
  {
    id: "nohwc",
    label: "HWC not discovered",
    title: "No HwcTimer entities in HA at all (wrong prefix, or not on this system)",
    run: (ebusd, cfg) => {
      allValues(ebusd);
      apply(ebusd, (s) => {
        for (const id of programEntityIds(cfg, PROGRAMS.hwc, "Timeframes")) delete s[id];
      });
    },
  },
];

/** A small toolbar above the cards. `initial` is the `?state=` URL parameter. */
export function mountScenarioBar(ebusd: FakeEbusd, cfg: ResolvedConfig, initial: string | null): void {
  const bar = document.createElement("div");
  bar.className = "scenarios";
  bar.innerHTML = `<span>Sensor states:</span>`;
  const buttons = SCENARIOS.map((sc) => {
    const b = document.createElement("button");
    b.textContent = sc.label;
    b.title = sc.title;
    b.dataset.id = sc.id;
    b.addEventListener("click", () => select(sc));
    bar.append(b);
    return b;
  });
  const select = (sc: Scenario) => {
    buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === sc.id)));
    sc.run(ebusd, cfg);
    const url = new URL(location.href);
    if (sc.id === "ok") url.searchParams.delete("state");
    else url.searchParams.set("state", sc.id);
    history.replaceState(null, "", url);
  };
  document.body.prepend(bar);
  select(SCENARIOS.find((s) => s.id === initial) ?? SCENARIOS[0]!);
}
