import { genderOptions, interestOptions } from "@/lib/constants/site";
export const statuses = [
  "waiting",
  "priority",
  "invited",
  "beta",
  "blocked",
] as const;
export const sortOptions = {
  newest: "Newest",
  oldest: "Oldest",
  referrals: "Most referrals",
  status: "Status",
  city: "City / region",
} as const;
export type AdminFilters = {
  sort?: keyof typeof sortOptions;
  status?: string;
  city_region?: string;
  gender?: string;
  interested_in?: string;
  referred?: "yes" | "no";
  date_from?: string;
  date_to?: string;
  page: number;
};
export type SearchParams = Record<string, string | string[] | undefined>;
export function parseFilters(query: SearchParams): AdminFilters | null {
  const allowed = [
    "status",
    "city_region",
    "gender",
    "interested_in",
    "referred",
    "date_from",
    "date_to",
    "page",
    "sort",
  ];
  if (
    Object.keys(query).some((key) => !allowed.includes(key)) ||
    Object.values(query).some((value) => Array.isArray(value))
  )
    return null;
  const get = (key: string) =>
    typeof query[key] === "string" ? (query[key] as string).trim() : "";
  const filters: AdminFilters = { page: 1 };
  for (const [key, options] of [
    ["status", statuses],
    ["gender", genderOptions],
    ["interested_in", interestOptions],
    ["referred", ["yes", "no"]],
  ] as const) {
    const value = get(key);
    if (value) {
      if (!(options as readonly string[]).includes(value)) return null;
      Object.assign(filters, { [key]: value });
    }
  }
  const sort = get("sort");
  if (sort) {
    if (!Object.keys(sortOptions).includes(sort)) return null;
    filters.sort = sort as keyof typeof sortOptions;
  }
  const city = get("city_region");
  if (city) {
    if (city.length > 100 || /[\x00-\x1f]/.test(city)) return null;
    filters.city_region = city;
  }
  for (const key of ["date_from", "date_to"] as const) {
    const value = get(key);
    if (value) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
      const date = new Date(`${value}T00:00:00Z`);
      if (
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value
      )
        return null;
      filters[key] = value;
    }
  }
  if (
    filters.date_from &&
    filters.date_to &&
    filters.date_from > filters.date_to
  )
    return null;
  const page = get("page");
  if (page) {
    if (!/^[1-9]\d{0,4}$/.test(page) || Number(page) > 10000) return null;
    filters.page = Number(page);
  }
  return filters;
}
export function pageLink(filters: AdminFilters, page: number) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, page }))
    if (value !== undefined && value !== "") query.set(key, String(value));
  return `/admin/waitlist?${query}`;
}
