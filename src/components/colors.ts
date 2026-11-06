import type { ProgramSpec } from "../model/types.js";

export type TempBand = "cold" | "mid" | "warm";

/** Thresholds per program: zone room temperature, HWC water temperature. */
const BANDS: Record<string, [number, number]> = {
  z1: [17.5, 22],
  z2: [17.5, 22],
  z3: [17.5, 22],
  hwc: [45, 55],
};

/** Colour band of a slot temperature (`cold` < a ≤ `mid` < b ≤ `warm`). */
export function tempBand(spec: ProgramSpec, temp: number | undefined): TempBand | null {
  const bands = BANDS[spec.id];
  if (!spec.temp || temp === undefined || !bands) return null;
  if (temp < bands[0]) return "cold";
  if (temp < bands[1]) return "mid";
  return "warm";
}
