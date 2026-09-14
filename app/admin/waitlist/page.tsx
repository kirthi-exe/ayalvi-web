import Link from "next/link";
import { Dashboard } from "@/components/admin/dashboard";
import { loadDashboard } from "@/lib/admin/data";
import type { SearchParams } from "@/lib/admin/filters";
export const runtime = "nodejs";
export default async function WaitlistAdmin({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const result = await loadDashboard(await searchParams);
  return (
    <main id="main" className="wrap admin-dashboard">
      <header className="admin-heading">
        <div>
          <p className="eyebrow">Internal · Invite preparation</p>
          <h1>Waitlist overview</h1>
        </div>
        <form method="post" action="/admin/logout">
          <button className="button secondary" type="submit">
            Sign out
          </button>
        </form>
      </header>
      {result.kind === "ready" ? (
        <Dashboard data={result.data} filters={result.filters} />
      ) : (
        <section className="admin-panel">
          <h2>
            {result.kind === "invalid"
              ? "Check your filters"
              : "Dashboard unavailable"}
          </h2>
          <p>
            {result.kind === "invalid"
              ? "Choose valid filter values and a valid date range."
              : "Waitlist data could not be loaded. Please try again later."}
          </p>
          <Link href="/admin/waitlist">
            {result.kind === "invalid" ? "Reset filters" : "Try again"}
          </Link>
        </section>
      )}
    </main>
  );
}
