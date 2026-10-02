import { redirect } from "next/navigation";
import { reviewerAccess } from "@/lib/reviewer/auth";
export default async function ReviewerLogin({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if ((await reviewerAccess()).kind === "authorized")
    redirect("/admin/verifications");
  const query = await searchParams;
  return (
    <main id="main" className="document wrap admin-login">
      <p className="eyebrow">Reviewer access</p>
      <h1>Sign in to review.</h1>
      <p>Use your authorized reviewer account.</p>
      <form
        method="post"
        action="/admin/verifications/session"
        aria-label="Reviewer sign in"
      >
        <label htmlFor="review-email">
          Email
          <input
            id="review-email"
            name="email"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
          />
        </label>
        <label htmlFor="review-password">
          Password
          <input
            id="review-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={512}
          />
        </label>
        <button className="button" type="submit">
          Sign in
        </button>
        {query.error && (
          <p role="alert">
            Unable to sign in. Check your access or try again later.
          </p>
        )}
      </form>
    </main>
  );
}
