import "server-only";
import { createClient } from "@supabase/supabase-js";
export function reviewerConfig() {
  const raw = process.env.REVIEW_SUPABASE_URL,
    key = process.env.REVIEW_SUPABASE_PUBLISHABLE_KEY;
  if (!raw || !key) throw new Error("Reviewer unavailable");
  const url = new URL(raw);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      ))
  )
    throw new Error("Reviewer unavailable");
  let publicKey = key.startsWith("sb_publishable_");
  if (!publicKey) {
    try {
      publicKey =
        JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString())
          .role === "anon";
    } catch {
      publicKey = false;
    }
  }
  if (!publicKey) throw new Error("Reviewer unavailable");
  return { url: url.origin, key };
}
export function reviewerClient() {
  const { url, key } = reviewerConfig();
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        }),
    },
  });
}
