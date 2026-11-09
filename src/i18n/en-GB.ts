import { en, type Strings } from "./en.js";

/** British English: "programme" as in Vaillant's UK documentation; everything else as `en`. */
export const enGB: Strings = {
  ...en,
  sameProgram: (days: string) => `${days} share the same programme`,
  differentPrograms: "Selected days have different programmes.",
  info: "About this time programme",
  offlineHelp: "All sensors of this programme are unavailable. Check that the ebusd add-on is running and connected to MQTT.",
  offlineHelpService:
    "Could not read this programme through the Vaillant eBUS integration. Check that it is loaded and connected to ebusd.",
  missingHelpService:
    "Check that the Vaillant eBUS integration is installed (with the read_time_program action) and the programme's message_prefix.",
  restored: "Previous programme restored",
  leaveWarning: "The time programme is still being written. Leaving now may leave days unchanged.",
};
