import { redirect } from "next/navigation";
import { reviewerAccess } from "@/lib/reviewer/auth";
import { ReviewerConsole } from "@/components/reviewer/console";
export const runtime = "nodejs";
export default async function Verifications() {
  const access = await reviewerAccess();
  if (access.kind === "unauthorized") redirect("/admin/verifications/login");
  if (access.kind !== "authorized")
    return (
      <main id="main" className="document wrap">
        <h1>
          {access.kind === "forbidden"
            ? "Reviewer access required."
            : "Review is unavailable."}
        </h1>
        <p>
          {access.kind === "forbidden"
            ? "This account cannot access profile reviews."
            : "Please try again later."}
        </p>
        <form method="post" action="/admin/verifications/logout">
          <button className="button">Return to sign in</button>
        </form>
      </main>
    );
  return (
    <main id="main" className="wrap reviewer-wrap">
      <nav aria-label="Reviewer navigation">
        <span>Internal review</span>
        <form method="post" action="/admin/verifications/logout">
          <button className="button small">Sign out</button>
        </form>
      </nav>
      <ReviewerConsole />
    </main>
  );
}
