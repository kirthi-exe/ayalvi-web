import { adminRedirect, sameOrigin } from "@/lib/admin/http";
import { cookieName, cookieOptions } from "@/lib/admin/session";
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return new Response("Request not permitted.", {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  const response = adminRedirect(request, "/admin/login");
  response.cookies.set(cookieName(), "", {
    ...cookieOptions(),
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}
