/** Number formatting of the active language (decimal comma in most of Europe). */
let temp1 = new Intl.NumberFormat("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
let tempShort = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });

export function setNumberLocale(tag: string): void {
  temp1 = new Intl.NumberFormat(tag, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  tempShort = new Intl.NumberFormat(tag, { maximumFractionDigits: 1 });
}

/** `21.0` / `21,0` – always one decimal. */
export function formatTemp(value: number): string {
  return temp1.format(value);
}

/** `21°`, `21.5°` / `21,5°` – compact label inside a bar. */
export function shortTemp(value: number): string {
  return `${tempShort.format(value)}°`;
}
