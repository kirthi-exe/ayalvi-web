import { statuses } from "./filters";
export type Status = (typeof statuses)[number];
export const transitions: Record<Status, readonly Status[]> = {
  waiting: ["priority", "invited", "blocked"],
  priority: ["invited", "blocked"],
  invited: ["beta", "blocked"],
  beta: ["blocked"],
  blocked: ["waiting"],
};
export const actionLabels: Record<Status, string> = {
  waiting: "Restore to Waiting",
  priority: "Mark Priority",
  invited: "Invite",
  beta: "Mark Beta",
  blocked: "Block",
};
export const MAX_BATCH = 25;
export type StatusAction = {
  entries: { id: string; expected_status: Status }[];
  target: Status;
  confirmed_block?: boolean;
};
export function parseStatusAction(value: unknown): StatusAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (k) => !["entries", "target", "confirmed_block"].includes(k),
    ) ||
    !statuses.includes(input.target as Status) ||
    !Array.isArray(input.entries) ||
    input.entries.length < 1 ||
    input.entries.length > MAX_BATCH
  )
    return null;
  const target = input.target as Status;
  if (
    ("confirmed_block" in input &&
      typeof input.confirmed_block !== "boolean") ||
    (target === "blocked" && input.confirmed_block !== true) ||
    (input.entries.length > 1 && !["priority", "invited"].includes(target))
  )
    return null;
  const ids = new Set<string>();
  for (const entry of input.entries) {
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      Object.keys(entry).some((k) => !["id", "expected_status"].includes(k)) ||
      typeof entry.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        entry.id,
      ) ||
      !statuses.includes(entry.expected_status) ||
      !transitions[entry.expected_status as Status].includes(target)
    )
      return null;
    if (ids.has(entry.id.toLowerCase())) return null;
    ids.add(entry.id.toLowerCase());
  }
  return input as StatusAction;
}
