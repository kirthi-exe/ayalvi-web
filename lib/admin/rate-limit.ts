import "server-only";
import { createHash } from "node:crypto";
// Best-effort per-process limit. Vercel WAF can provide a shared limit across instances.
export function createLoginLimiter(now = Date.now) {
  const entries = new Map<string, { count: number; expires: number }>();
  let global = { count: 0, expires: 0 };
  return (headers: Headers) => {
    const time = now();
    for (const [key, bucket] of entries)
      if (bucket.expires <= time) entries.delete(key);
    if (global.expires <= time)
      global = { count: 0, expires: time + 15 * 60 * 1000 };
    if (++global.count > 30) return false;
    // Trust the platform-overwritten header only on Vercel. Never retain raw IPs.
    const client =
      process.env.VERCEL === "1"
        ? (headers.get("x-forwarded-for") || "unknown")
            .split(",")[0]
            .trim()
            .slice(0, 64)
        : "local";
    const key = createHash("sha256").update(client).digest("hex");
    if (!entries.has(key) && entries.size >= 1000) return false;
    const bucket = entries.get(key) || {
      count: 0,
      expires: time + 15 * 60 * 1000,
    };
    bucket.count++;
    entries.set(key, bucket);
    return bucket.count <= 5;
  };
}
export const allowLoginAttempt = createLoginLimiter();
