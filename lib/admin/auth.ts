import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cookieName, validSession } from "./session";
export async function isAdmin() {
  const jar = await cookies();
  return validSession(jar.get(cookieName())?.value);
}
export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}
