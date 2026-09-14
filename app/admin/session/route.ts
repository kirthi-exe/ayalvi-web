import { adminRedirect, readPassword, sameOrigin } from "@/lib/admin/http";
import { allowLoginAttempt } from "@/lib/admin/rate-limit";
import {
  matchesPassword,
  createSession,
  cookieName,
  cookieOptions,
} from "@/lib/admin/session";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const rejected = () => adminRedirect(request, "/admin/login?error=1");
  if (!sameOrigin(request) || !allowLoginAttempt(request.headers))
    return rejected();
  const password = await readPassword(request);
  if (password === null || !matchesPassword(password)) return rejected();
  const response = adminRedirect(request, "/admin/waitlist");
  response.cookies.set(cookieName(), createSession(), cookieOptions());
  return response;
}
