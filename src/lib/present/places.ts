// Place-value (разряд) and class (класс) naming + digit helpers shared by the
// place-value, expand, digit-meaning and class-table slide widgets. Names
// follow the grade-5 textbook wording (бірлік, ондық, жүздік, мыңдық, …).

import type { Lang } from "@/lib/i18n/strings";

export const MAX_DIGITS = 15;

/** Place names, index 0 = units place. */
const PLACE_NAMES: { kz: string; ru: string }[] = [
  { kz: "бірлік", ru: "единицы" },
  { kz: "ондық", ru: "десятки" },
  { kz: "жүздік", ru: "сотни" },
  { kz: "мыңдық", ru: "тысячи" },
  { kz: "он мыңдық", ru: "десятки тысяч" },
  { kz: "жүз мыңдық", ru: "сотни тысяч" },
  { kz: "миллион", ru: "миллионы" },
  { kz: "он миллион", ru: "десятки миллионов" },
  { kz: "жүз миллион", ru: "сотни миллионов" },
  { kz: "миллиард", ru: "миллиарды" },
  { kz: "он миллиард", ru: "десятки миллиардов" },
  { kz: "жүз миллиард", ru: "сотни миллиардов" },
  { kz: "триллион", ru: "триллионы" },
  { kz: "он триллион", ru: "десятки триллионов" },
  { kz: "жүз триллион", ru: "сотни триллионов" },
];

/** Class names, index 0 = units class (digits 1–3). */
export const CLASS_NAMES: { kz: string; ru: string }[] = [
  { kz: "Бірліктер", ru: "Единицы" },
  { kz: "Мыңдар", ru: "Тысячи" },
  { kz: "Миллиондар", ru: "Миллионы" },
  { kz: "Миллиардтар", ru: "Миллиарды" },
  { kz: "Триллиондар", ru: "Триллионы" },
];

/** Short column labels inside one class: hundreds / tens / units. */
export const CLASS_COLUMN_SHORT: { kz: string; ru: string }[] = [
  { kz: "жүзд.", ru: "сот." },
  { kz: "онд.", ru: "дес." },
  { kz: "бірл.", ru: "ед." },
];

export function placeName(place: number, lang: Lang): string {
  const entry = PLACE_NAMES[place];
  if (!entry) return "";
  return lang === "ru" ? entry.ru : entry.kz;
}

export function className(cls: number, lang: Lang): string {
  const entry = CLASS_NAMES[cls];
  if (!entry) return "";
  return lang === "ru" ? entry.ru : entry.kz;
}

/**
 * Normalize a number/string into a plain digit string ("35 749" → "35749").
 * Returns null when the value is not a valid natural number of ≤15 digits.
 */
export function digitsOf(value: number | string): string | null {
  const raw =
    typeof value === "number" ? String(value) : value.replace(/[\s  ]/g, "");
  if (!/^[0-9]+$/.test(raw)) return null;
  const trimmed = raw.replace(/^0+(?=.)/, "");
  if (trimmed.length > MAX_DIGITS) return null;
  return trimmed;
}

/** "35749" → "35 749" (thin spaces between 3-digit groups). */
export function groupDigits(digits: string): string {
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    const fromRight = digits.length - i;
    out += digits[i];
    if (fromRight > 1 && (fromRight - 1) % 3 === 0) out += " ";
  }
  return out;
}

/** digit × 10^place as a grouped string ("7", place 2 → "700"). */
export function placeValueOf(digit: number, place: number): string {
  return groupDigits(String(digit) + "0".repeat(place));
}

/** Unit of a place as a grouped string (place 4 → "10 000"). */
export function placeUnit(place: number): string {
  return groupDigits("1" + "0".repeat(place));
}
