import type { IssueCode } from "../model/validate.js";
import type { Params, Strings } from "./en.js";
import { formatTemp } from "./format.js";

type Field = "start" | "end" | "temp";
const FIELD: Record<Field, string> = { start: "Початок", end: "Кінець", temp: "Температура" };

/** Ukrainian plural: 1, 21 … / 2–4, 22 … / everything else. */
const plural = (n: number, one: string, few: string, many: string) => {
  const t = n % 10;
  const h = n % 100;
  if (t === 1 && h !== 11) return `${n} ${one}`;
  return `${n} ${t >= 2 && t <= 4 && (h < 12 || h > 14) ? few : many}`;
};
const days = (n: number) => plural(n, "день", "дні", "днів");
const slots = (n: number) => plural(n, "інтервал", "інтервали", "інтервалів");

export const uk: Strings = {
  defaultTitle: "Тижнева програма",
  programNames: { z1: "Зона 1", z2: "Зона 2", z3: "Зона 3", hwc: "Гаряча вода", cc: "Циркуляція" },
  programShort: { z1: "З1", z2: "З2", z3: "З3", hwc: "ГВП", cc: "ЦИРК" },
  issues: {
    invalid_time: (p) => `Неправильний час «${p.value}»`,
    off_grid: () => "Час має бути кратним 10 хвилинам",
    start_24: () => "24:00 дозволено лише як кінець",
    end_before_start: () => "Кінець має бути пізніше за початок",
    overlap: (p) => `Перетинається з інтервалом ${p.other} (${p.range})`,
    too_many_slots: (p) => `Не більше ${p.max} інтервалів`,
    temp_missing: () => "Потрібна температура",
    temp_range: (p) => `Температура має бути від ${p.min} до ${p.max} °C`,
    temp_rounded: (p) => `Під час збереження буде округлено до ${formatTemp(Number(p.value))} °C`,
    temp_low: () => "Низька температура – так задумано?",
    mergeable: (p) => `Інтервали ${p.a} і ${p.b} стикаються – об’єднати?`,
    no_days: () => "Виберіть хоча б один день",
  } as Record<IssueCode, (p: Params) => string>,
  days: "Дні",
  quickSelect: "Швидкий вибір",
  preview: "Перегляд",
  now: "Зараз",
  start: "Початок",
  end: "Кінець",
  temp: "Темп.",
  slot: slots,
  slotN: (n: number) => `Інтервал ${n}`,
  offAllDay: "Вимкнено весь день",
  loading: "Завантаження…",
  noDaySelected: "Виберіть хоча б один день",
  presets: { all: "Усі", weekdays: "Пн–Пт", weekend: "Сб–Нд" },
  dayShort: { monday: "Пн", tuesday: "Вт", wednesday: "Ср", thursday: "Чт", friday: "Пт", saturday: "Сб", sunday: "Нд" },
  dayLong: {
    monday: "Понеділок",
    tuesday: "Вівторок",
    wednesday: "Середа",
    thursday: "Четвер",
    friday: "П’ятниця",
    saturday: "Субота",
    sunday: "Неділя",
  },
  sameProgram: (d: string) => `${d} мають однакову програму`,
  differentPrograms: "Вибрані дні мають різні програми.",
  showingFrom: "Показано",
  info: "Про цю часову програму",
  hint: {
    zone: (setback: number | null) =>
      setback === null
        ? "Поза цими інтервалами зона гріє лише до зниженої температури."
        : `Поза цими інтервалами зона гріє лише до зниженої температури ${formatTemp(setback)} °C.`,
    hwc: () => "Поза цими інтервалами гаряча вода не догрівається.",
    cc: () => "Поза цими інтервалами циркуляційний насос вимкнено.",
  },
  status: {
    ok: "Підключено – значення з ebusd",
    loading: "Очікування значень з ebusd…",
    offline: "ebusd недоступний",
    missing: "Сутності ebusd не знайдено",
  },
  offlineHelp: "Усі датчики цієї програми недоступні. Перевірте, чи працює доповнення ebusd і чи підключене воно до MQTT.",
  missingLookedFor: "Шукали одну з:",
  missingHelp: "Перевірте mqtt_prefix, circuit і entity_template у налаштуваннях картки.",
  missingZone: (name: string, id: string) => `Якщо в цій системі немає «${name}», видаліть ${id} з programs.`,
  startEmpty: "Почати з порожнього",
  unsaved: "незбережені зміни",
  addSlot: "Додати інтервал",
  slotsLeft: (n: number) => `(залишилось ${n})`,
  noGap: "У цей день більше немає вільного часу",
  deleteSlot: (n: number) => `Видалити інтервал ${n}`,
  editField: (field: Field, n: number) => `${FIELD[field]}, інтервал ${n}`,
  tempUnknown: "– °C",
  sheetTitle: (field: Field, n: number) => `${FIELD[field]} · Інтервал ${n}`,
  hour: "Година",
  minute: "Хвилина",
  up: (what: string) => `${what} більше`,
  down: (what: string) => `${what} менше`,
  minus10: "−10 хв",
  plus10: "+10 хв",
  tempDown: "Знизити температуру",
  tempUp: "Підвищити температуру",
  done: "Готово",
  cancel: "Скасувати",
  setbackTitle: "Знижена температура",
  save: "Зберегти",
  saveFailed: (message: string) => `Не вдалося зберегти: ${message}`,
  setbackReadOnly: "Налаштовується на регуляторі.",
  change: "Зміна:",
  dayCount: days,
  unchangedDays: (d: string) => `${d} без змін`,
  errors: (n: number) => `${plural(n, "помилка", "помилки", "помилок")} – виправте перед застосуванням`,
  slotsAdded: (n: number) => `Додано: ${slots(n)}`,
  slotsRemoved: (n: number) => `Видалено: ${slots(n)}`,
  discard: "Відхилити",
  applyTo: (n: number) => `Застосувати до: ${days(n)}`,
  close: "Закрити",
  writing: (program: string) => `Запис: ${program} …`,
  restoring: (program: string) => `Відновлення: ${program} …`,
  progress: (done: number, total: number) => `${done} / ${total}`,
  dayState: {
    queued: "очікує",
    writing: "запис",
    verifying: "перевірка",
    done: "готово",
    failed: "помилка",
    skipped: "не записано",
  },
  cancelAfterDay: "Зупинити після цього дня",
  cancelling: "Зупинка після цього дня …",
  saved: (d: string, n: number) => `Збережено: ${d} (${days(n)}) – підтверджено регулятором`,
  restored: "Попередню програму відновлено",
  failedAt: (day: string) => `Запис зупинено: ${day}`,
  cancelled: "Запис скасовано",
  cancelledHelp: (written: string) => (written ? `Уже записано: ${written}.` : "Жоден день не записано."),
  reason: {
    count: (actual: number, expected: number) => `Регулятор повідомляє ${slots(actual)}, очікувалось ${expected}`,
    slot: (index: number, actual: string, expected: string) =>
      `Інтервал ${index + 1}: у регуляторі ${actual}, очікувалось ${expected}`,
    timeout: (s: number) => `Немає підтвердження від регулятора протягом ${s} с`,
    publish: (message: string) => `Не вдалося надіслати в MQTT: ${message}`,
  },
  restorePrevious: "Відновити попередню",
  retry: "Повторити",
  continueWrite: "Продовжити",
  noMqtt: "Це підключення Home Assistant не може викликати служби (mqtt.publish).",
  otherCardBusy: "Інша картка зараз записує в регулятор. Спробуйте, коли вона закінчить.",
  leaveWarning: "Часова програма ще записується. Якщо вийти зараз, деякі дні можуть залишитися без змін.",
  busyStatus: "Запис у регулятор …",
};
