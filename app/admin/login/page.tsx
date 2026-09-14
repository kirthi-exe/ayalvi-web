import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin/auth";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await isAdmin()) redirect("/admin/waitlist");
  const query = await searchParams;
  return (
    <main id="main" className="document wrap admin-login">
      <span className="eyebrow">AYALVI / INTERNAL ACCESS</span>
      <h1>Welcome back.</h1>
      <p>Sign in to view the waitlist.</p>
      <form
        action="/admin/session"
        method="post"
        className="waitlist-form"
        aria-label="Admin sign in"
      >
        <label htmlFor="admin-password">Admin password</label>
        <input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={256}
        />
        <button className="button" type="submit">
          Sign in
        </button>
        {query.error && (
          <p className="field-error" role="alert">
            Unable to sign in. Check your password or try again later.
          </p>
        )}
      </form>
    </main>
  );
}
