import { genderOptions, interestOptions } from "../constants/site";
export type Entry = {
  email: string;
  city_region: string;
  gender: string;
  interested_in: string;
  is_18_plus: true;
  heard_from?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
};
export type Errors = Record<string, string>;
export function validate(
  input: unknown,
): { data: Entry; errors?: never } | { errors: Errors; data?: never } {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { errors: { form: "Please check your submission." } };
  const raw = input as Record<string, unknown>;
  const errors: Errors = {};
  const allowed = [
    "email",
    "city_region",
    "gender",
    "interested_in",
    "is_18_plus",
    "heard_from",
    "website",
    "utm_source",
    "utm_medium",
    "utm_campaign",
  ];
  if (Object.keys(raw).some((k) => !allowed.includes(k)))
    errors.form = "Unexpected submission fields.";
  const str = (key: string) =>
    typeof raw[key] === "string" ? (raw[key] as string).trim() : "";
  if (
    raw.website !== undefined &&
    (typeof raw.website !== "string" || str("website"))
  )
    errors.form = "Unable to accept this submission.";
  const email = str("email").toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.email = "Enter a valid email address.";
  const city_region = str("city_region");
  if (
    city_region.length < 2 ||
    city_region.length > 100 ||
    /[\x00-\x1f]/.test(city_region)
  )
    errors.city_region = "Enter a city or region (2–100 characters).";
  const gender = str("gender"),
    interested_in = str("interested_in");
  if (!(genderOptions as readonly string[]).includes(gender))
    errors.gender = "Choose an option.";
  if (!(interestOptions as readonly string[]).includes(interested_in))
    errors.interested_in = "Choose an option.";
  if (raw.is_18_plus !== true)
    errors.is_18_plus = "You must confirm you are 18 or older.";
  const optional: Record<string, string> = {};
  for (const key of [
    "heard_from",
    "utm_source",
    "utm_medium",
    "utm_campaign",
  ]) {
    if (raw[key] !== undefined && typeof raw[key] !== "string")
      errors[key] = "Enter text only.";
    const value = str(key);
    if (value.length > 120 || /[\x00-\x1f<>]/.test(value))
      errors[key] = "Use plain text, up to 120 characters.";
    if (value) optional[key] = value;
  }
  return Object.keys(errors).length
    ? { errors }
    : {
        data: {
          email,
          city_region,
          gender,
          interested_in,
          is_18_plus: true,
          ...optional,
        },
      };
}
