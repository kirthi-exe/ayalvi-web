import { isAdmin } from "@/lib/admin/auth";
import { sameOrigin } from "@/lib/admin/http";
import { parseStatusAction } from "@/lib/admin/transitions";
import { applyStatusAction } from "@/lib/admin/mutations";
export const runtime = "nodejs";
const reply = (body: object, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function POST(request: Request) {
  if (!(await isAdmin()))
    return reply({ message: "Sign in to continue." }, 401);
  if (!sameOrigin(request))
    return reply({ message: "Request not permitted." }, 403);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    return reply({ message: "Invalid action." }, 400);
  const reader = request.body?.getReader();
  if (!reader) return reply({ message: "Invalid action." }, 400);
  try {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        return reply({ message: "Invalid action." }, 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    let input: unknown;
    try {
      input = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return reply({ message: "Invalid action." }, 400);
    }
    const action = parseStatusAction(input);
    if (!action) return reply({ message: "Invalid action." }, 400);
    if (!(await applyStatusAction(action)))
      return reply(
        { message: "Could not update the selection. Refresh and try again." },
        409,
      );
    return reply({ success: true });
  } catch {
    return reply(
      { message: "Could not update the selection. Refresh and try again." },
      503,
    );
  } finally {
    reader.releaseLock();
  }
}
