import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  isSupportedCountry,
  CountryCode,
} from "libphonenumber-js";
import * as Localization from "expo-localization";

export type CountryItem = { iso: CountryCode; name: string; code: string; flag: string };

// ISO alpha-2 -> flag emoji via regional-indicator symbols (renders natively on iOS).
function flagEmoji(iso: string): string {
  return iso
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

let _list: CountryItem[] | null = null;
export function countryList(): CountryItem[] {
  if (_list) return _list;
  let dn: Intl.DisplayNames | undefined;
  try {
    dn = new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    dn = undefined;
  }
  _list = getCountries()
    .map((iso) => ({
      iso,
      name: (dn && dn.of(iso)) || iso,
      code: getCountryCallingCode(iso),
      flag: flagEmoji(iso),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return _list;
}

export function dialCode(iso: CountryCode): string {
  try {
    return getCountryCallingCode(iso);
  } catch {
    return "";
  }
}

// The device's region, if we support it; else US.
export function deviceCountry(): CountryCode {
  try {
    const r = Localization.getLocales()?.[0]?.regionCode;
    if (r && isSupportedCountry(r)) return r as CountryCode;
  } catch {
    // ignore
  }
  return "US";
}

// Split a stored value (+<code><national> or digits-only for WhatsApp) into a
// country + national number. If it can't be parsed, return the raw string in
// `national` with `parsed: false` so the UI can show it unchanged.
export function splitStored(
  stored: string,
  fallback: CountryCode
): { country: CountryCode; national: string; parsed: boolean } {
  const s = (stored || "").trim();
  if (!s) return { country: fallback, national: "", parsed: true };
  const withPlus = s.startsWith("+") ? s : "+" + s.replace(/\D/g, "");
  const p = parsePhoneNumberFromString(withPlus);
  if (p && p.country) return { country: p.country, national: p.nationalNumber, parsed: true };
  return { country: fallback, national: s, parsed: false };
}

// Validate a national number for a country and return E.164 (+<code><number>).
export function toE164(country: CountryCode, national: string): { valid: boolean; e164?: string } {
  const n = (national || "").trim();
  if (!n) return { valid: false };
  const p = parsePhoneNumberFromString(n, country);
  if (p && p.isValid()) return { valid: true, e164: p.number };
  return { valid: false };
}
