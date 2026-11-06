import type { ProgramId, ProgramSpec } from "./types.js";

/** Vaillant limit: at most 3 slots per day. Fixed, not configurable. */
export const MAX_SLOTS = 3;

/** Grid of the controller / myVAILLANT app in minutes. Fixed, not configurable. */
export const TIME_STEP = 10;

/**
 * Heating zone n. Z2/Z3 follow the Z1 message names of the ebusd ctlv2 config
 * (`Z2Timer_Monday`, `Z2NightTemp`); only Z1 is verified on a real controller.
 */
const zone = (n: 1 | 2 | 3): ProgramSpec => ({
  id: `z${n}`,
  messagePrefix: `Z${n}Timer`,
  temp: { min: 5, max: 30, step: 0.5 },
  lowTempWarning: 15,
  defaultTemp: 20,
  setbackMessage: `Z${n}NightTemp`,
});

export const PROGRAMS: Record<ProgramId, ProgramSpec> = {
  z1: zone(1),
  z2: zone(2),
  z3: zone(3),
  hwc: {
    id: "hwc",
    messagePrefix: "HwcTimer",
    temp: { min: 35, max: 70, step: 0.5 },
    defaultTemp: 50,
  },
  cc: {
    id: "cc",
    messagePrefix: "CcTimer",
    temp: null,
  },
};
