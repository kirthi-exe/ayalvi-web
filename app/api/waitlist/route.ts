import { insertEntry } from "@/lib/supabase/waitlist";
import { validate } from "@/lib/validation/waitlist";
import { verifyAbuseProtection } from "@/lib/validation/abuse";
export const runtime = "nodejs";
const reply = (body: object, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return reply({ message: "Submission not permitted." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return reply({ message: "Expected JSON." }, 415);
  const reader = request.body?.getReader();
  if (!reader) return reply({ message: "Missing submission." }, 400);
  try {
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        return reply({ message: "Submission too large." }, 413);
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
      return reply({ message: "Invalid submission." }, 400);
    }
    const result = validate(input);
    if (result.errors)
      return reply(
        {
          message: "Please check the highlighted fields.",
          errors: result.errors,
        },
        400,
      );
    if (!(await verifyAbuseProtection(request)))
      return reply({ message: "Please try again later." }, 400);
    const { code } = await insertEntry(result.data);
    if (code && code !== "23505")
      return reply(
        { message: "We couldn’t save your signup. Please try again shortly." },
        503,
      );
    return reply({ success: true });
  } catch {
    return reply(
      { message: "We couldn’t save your signup. Please try again shortly." },
      503,
    );
  }
}
