import type { ProgramId, ProgramSpec } from "./types.js";

/** Vaillant limit: at most 3 slots per day. Fixed, not configurable. */
export const MAX_SLOTS = 3;

/** Grid of the controller / myVAILLANT app in minutes. Fixed, not configurable. */
export const TIME_STEP = 10;

export const PROGRAMS: Record<ProgramId, ProgramSpec> = {
  z1: {
    id: "z1",
    messagePrefix: "Z1Timer",
    temp: { min: 5, max: 30, step: 0.5 },
    lowTempWarning: 15,
  },
  hwc: {
    id: "hwc",
    messagePrefix: "HwcTimer",
    temp: { min: 35, max: 70, step: 0.5 },
  },
  cc: {
    id: "cc",
    messagePrefix: "CcTimer",
    temp: null,
  },
};
