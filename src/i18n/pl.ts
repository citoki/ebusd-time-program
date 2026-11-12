import type { IssueCode } from "../model/validate.js";
import type { Params, Strings } from "./en.js";
import { formatTemp } from "./format.js";

type Field = "start" | "end" | "temp";
const FIELD: Record<Field, string> = { start: "Początek", end: "Koniec", temp: "Temperatura" };

/** Polish plural: 1 / 2–4 (not 12–14) / everything else. */
const plural = (n: number, one: string, few: string, many: string) => {
  if (n === 1) return `1 ${one}`;
  const t = n % 10;
  const h = n % 100;
  return `${n} ${t >= 2 && t <= 4 && (h < 12 || h > 14) ? few : many}`;
};
const days = (n: number) => plural(n, "dzień", "dni", "dni");
const slots = (n: number) => plural(n, "przedział", "przedziały", "przedziałów");

export const pl: Strings = {
  defaultTitle: "Program tygodniowy",
  programNames: { z1: "Strefa 1", z2: "Strefa 2", z3: "Strefa 3", hwc: "Ciepła woda", cc: "Cyrkulacja" },
  programShort: { z1: "S1", z2: "S2", z3: "S3", hwc: "CWU", cc: "CYRK" },
  issues: {
    invalid_time: (p) => `Nieprawidłowa godzina „${p.value}”`,
    off_grid: () => "Godzina musi być wielokrotnością 10 minut",
    start_24: () => "24:00 jest dozwolone tylko jako koniec",
    end_before_start: () => "Koniec musi być po początku",
    overlap: (p) => `Nakłada się na przedział ${p.other} (${p.range})`,
    too_many_slots: (p) => `Maksymalnie ${p.max} przedziały`,
    temp_missing: () => "Temperatura jest wymagana",
    temp_range: (p) => `Temperatura musi wynosić od ${p.min} do ${p.max} °C`,
    temp_rounded: (p) => `Przy zapisie zostanie zaokrąglona do ${formatTemp(Number(p.value))} °C`,
    temp_low: () => "Niska temperatura – celowo?",
    mergeable: (p) => `Przedziały ${p.a} i ${p.b} stykają się – połączyć?`,
    no_days: () => "Wybierz co najmniej jeden dzień",
  } as Record<IssueCode, (p: Params) => string>,
  days: "Dni",
  quickSelect: "Szybki wybór",
  schedule: "Aktualny program",
  now: "Teraz",
  start: "Początek",
  end: "Koniec",
  temp: "Temp.",
  slot: slots,
  slotN: (n: number) => `Przedział ${n}`,
  offAllDay: "Wyłączone cały dzień",
  loading: "Ładowanie…",
  noDaySelected: "Wybierz co najmniej jeden dzień",
  presets: { all: "Wszystkie", weekdays: "Pn–Pt", weekend: "So–Nd" },
  dayShort: { monday: "Pn", tuesday: "Wt", wednesday: "Śr", thursday: "Cz", friday: "Pt", saturday: "So", sunday: "Nd" },
  dayLong: {
    monday: "Poniedziałek",
    tuesday: "Wtorek",
    wednesday: "Środa",
    thursday: "Czwartek",
    friday: "Piątek",
    saturday: "Sobota",
    sunday: "Niedziela",
  },
  sameProgram: (d: string) => `${d} mają ten sam program`,
  differentPrograms: "Wybrane dni mają różne programy.",
  showingFrom: "Pokazano",
  info: "O tym programie czasowym",
  hint: {
    zone: (setback: number | null) =>
      setback === null
        ? "Poza tymi przedziałami strefa grzeje tylko do temperatury obniżonej."
        : `Poza tymi przedziałami strefa grzeje tylko do temperatury obniżonej ${formatTemp(setback)} °C.`,
    hwc: () => "Poza tymi przedziałami ciepła woda nie jest podgrzewana.",
    cc: () => "Poza tymi przedziałami pompa cyrkulacyjna jest wyłączona.",
  },
  status: {
    ok: "Połączono – wartości z ebusd",
    loading: "Oczekiwanie na wartości z ebusd…",
    offline: "ebusd niedostępny",
    missing: "Nie znaleziono encji ebusd",
  },
  offlineHelp: "Wszystkie czujniki tego programu są niedostępne. Sprawdź, czy dodatek ebusd działa i jest połączony z MQTT.",
  missingLookedFor: "Szukano jednej z:",
  missingHelp: "Sprawdź mqtt_prefix, circuit i entity_template w konfiguracji karty.",
  offlineHelpService: "Nie udało się odczytać tego programu przez integrację Vaillant eBUS. Sprawdź, czy jest załadowana i połączona z ebusd.",
  missingHelpService: "Sprawdź, czy integracja Vaillant eBUS jest zainstalowana (z akcją read_time_program) oraz message_prefix programu.",
  missingZone: (name: string, id: string) => `Jeśli ta instalacja nie ma strefy „${name}”, usuń ${id} z programs.`,
  startEmpty: "Zacznij od pustego",
  unsaved: "niezapisane zmiany",
  addSlot: "Dodaj przedział",
  slotsLeft: (n: number) => `(pozostało ${n})`,
  noGap: "Brak wolnego czasu w tym dniu",
  deleteSlot: (n: number) => `Usuń przedział ${n}`,
  editField: (field: Field, n: number) => `${FIELD[field]}, przedział ${n}`,
  tempUnknown: "– °C",
  sheetTitle: (field: Field, n: number) => `${FIELD[field]} · Przedział ${n}`,
  hour: "Godzina",
  minute: "Minuta",
  up: (what: string) => `${what} w górę`,
  down: (what: string) => `${what} w dół`,
  minus10: "−10 min",
  plus10: "+10 min",
  tempDown: "Obniż temperaturę",
  tempUp: "Podnieś temperaturę",
  done: "Gotowe",
  cancel: "Anuluj",
  setbackTitle: "Temperatura obniżona",
  save: "Zapisz",
  saveFailed: (message: string) => `Nie udało się zapisać: ${message}`,
  setbackReadOnly: "Ustaw w regulatorze.",
  change: "Zmiana:",
  dayCount: days,
  unchangedDays: (d: string) => `${d} bez zmian`,
  errors: (n: number) => `${plural(n, "błąd", "błędy", "błędów")} – popraw przed zastosowaniem`,
  slotsAdded: (n: number) => `Dodano: ${slots(n)}`,
  slotsRemoved: (n: number) => `Usunięto: ${slots(n)}`,
  discard: "Odrzuć",
  applyTo: (n: number) => `Zastosuj do: ${days(n)}`,
  close: "Zamknij",
  writing: (program: string) => `Zapisywanie: ${program} …`,
  restoring: (program: string) => `Przywracanie: ${program} …`,
  progress: (done: number, total: number) => `${done} / ${total}`,
  dayState: {
    queued: "oczekuje",
    writing: "zapis",
    verifying: "sprawdzanie",
    done: "gotowe",
    failed: "błąd",
    skipped: "nie zapisano",
  },
  cancelAfterDay: "Przerwij po tym dniu",
  cancelling: "Zatrzymanie po tym dniu …",
  saved: (d: string, n: number) => `Zapisano: ${d} (${days(n)}) – potwierdzone przez regulator`,
  restored: "Przywrócono poprzedni program",
  failedAt: (day: string) => `Zapis przerwany: ${day}`,
  cancelled: "Zapis anulowany",
  cancelledHelp: (written: string) => (written ? `Już zapisano: ${written}.` : "Nie zapisano żadnego dnia."),
  reason: {
    count: (actual: number, expected: number) => `Regulator zgłasza ${slots(actual)}, oczekiwano ${expected}`,
    slot: (index: number, actual: string, expected: string) =>
      `Przedział ${index + 1}: regulator ma ${actual}, oczekiwano ${expected}`,
    timeout: (s: number) => `Brak potwierdzenia z regulatora w ciągu ${s} s`,
    publish: (message: string) => `Nie udało się wysłać do MQTT: ${message}`,
    service: (message: string) => `Vaillant eBUS: ${message}`,
  },
  restorePrevious: "Przywróć poprzedni",
  retry: "Ponów",
  continueWrite: "Kontynuuj",
  noMqtt: "To połączenie z Home Assistant nie może wywoływać usług (mqtt.publish).",
  otherCardBusy: "Inna karta zapisuje teraz do regulatora. Spróbuj ponownie, gdy skończy.",
  leaveWarning: "Program czasowy jest jeszcze zapisywany. Wyjście teraz może pozostawić niektóre dni bez zmian.",
  busyStatus: "Zapisywanie do regulatora …",
};
