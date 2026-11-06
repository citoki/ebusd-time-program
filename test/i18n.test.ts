import { afterEach, describe, expect, it } from "vitest";
import { resolveConfig } from "../src/config.js";
import { formatTemp, issueMessage, LANGUAGES, programName, resolveLanguage, setLanguage, shortTemp, UI } from "../src/i18n/index.js";

afterEach(() => setLanguage("en"));

describe("language selection", () => {
  it("maps HA language codes to a supported language", () => {
    expect(resolveLanguage("de")).toBe("de");
    expect(resolveLanguage("de-CH")).toBe("de");
    expect(resolveLanguage("en-GB")).toBe("en-GB");
    expect(resolveLanguage("en-gb")).toBe("en-GB");
    expect(resolveLanguage("en-US")).toBe("en");
    expect(resolveLanguage("pt-BR")).toBe("en"); // not translated -> English
    expect(resolveLanguage(undefined)).toBe("en");
  });

  it("offers the 14 languages", () => {
    expect(Object.keys(LANGUAGES).sort()).toEqual(
      ["da", "de", "el", "en", "en-GB", "es", "fr", "hu", "it", "nl", "pl", "ro", "sv", "uk"].sort(),
    );
  });

  it("switches texts, program names and the decimal separator", () => {
    const cfg = resolveConfig({ type: "x", programs: ["z1", "hwc", { id: "cc", name: "Pumpe" }] });
    setLanguage("de");
    expect(UI.defaultTitle).toBe("Wochenprogramm");
    expect(cfg.programs.map(programName)).toEqual(["Zone 1", "Warmwasser", "Pumpe"]); // configured name stays
    expect(formatTemp(21.5)).toBe("21,5");
    expect(shortTemp(21)).toBe("21°");
    expect(issueMessage({ code: "temp_rounded", level: "warning", params: { value: 21.5 } })).toBe(
      "Wird beim Speichern auf 21,5 °C gerundet",
    );
    setLanguage("en");
    expect(formatTemp(21.5)).toBe("21.5");
  });
});

describe("translations", () => {
  it("every language has a text for every key (functions return non-empty strings)", () => {
    const sample = (v: unknown): unknown =>
      typeof v === "function" ? (v as (...a: unknown[]) => unknown)(2, 3, "x") : v;
    for (const [lang, strings] of Object.entries(LANGUAGES)) {
      const walk = (o: Record<string, unknown>, path: string) => {
        for (const [k, v] of Object.entries(o)) {
          if (v && typeof v === "object") walk(v as Record<string, unknown>, `${path}.${k}`);
          else {
            const text = sample(v);
            expect(typeof text, `${lang}${path}.${k}`).toBe("string");
            expect((text as string).length, `${lang}${path}.${k}`).toBeGreaterThan(0);
          }
        }
      };
      walk(strings as unknown as Record<string, unknown>, "");
    }
  });

  it("Polish and Ukrainian plurals", () => {
    expect(LANGUAGES.pl!.slot(1)).toBe("1 przedział");
    expect(LANGUAGES.pl!.slot(3)).toBe("3 przedziały");
    expect(LANGUAGES.pl!.dayCount(5)).toBe("5 dni");
    expect(LANGUAGES.uk!.dayCount(1)).toBe("1 день");
    expect(LANGUAGES.uk!.dayCount(3)).toBe("3 дні");
    expect(LANGUAGES.uk!.dayCount(7)).toBe("7 днів");
  });
});
