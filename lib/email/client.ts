import "server-only";
import { Resend } from "resend";
export function createEmailClient(key: string) {
  const client = new Resend(key, { baseUrl: "https://api.resend.com" });
  // Pinned SDK 6.28.0 logs raw provider errors outside production. Suppress
  // that instance-local hook; the caller reports only fixed safe event names.
  // A real-SDK regression test protects this behavior when updating the SDK.
  Object.defineProperty(client, "logError", { value: () => undefined });
  return client;
}
