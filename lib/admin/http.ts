import "server-only";
import { NextResponse } from "next/server";
export function adminRedirect(request: Request, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url), 303);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}
export function sameOrigin(request: Request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}
export async function readPassword(request: Request) {
  if (
    request.headers.get("content-type")?.split(";")[0] !==
    "application/x-www-form-urlencoded"
  )
    return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  try {
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const form = new URLSearchParams(new TextDecoder().decode(bytes));
    if (
      [...form.keys()].some((key) => key !== "password") ||
      form.getAll("password").length !== 1
    )
      return null;
    const value = form.get("password");
    return value && value.length <= 256 ? value : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}
