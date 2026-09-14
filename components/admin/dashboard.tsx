import Link from "next/link";
import type { Breakdown, DashboardData } from "@/lib/admin/data";
import { pageLink, statuses, type AdminFilters } from "@/lib/admin/filters";
import { genderOptions, interestOptions } from "@/lib/constants/site";
const date = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
function Chart({ title, items }: { title: string; items: Breakdown[] }) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <section className="admin-panel">
      <h2>{title}</h2>
      {items.length ? (
        <ul className="admin-chart">
          {items.map((item) => (
            <li key={item.label}>
              <div>
                <span>{item.label}</span>
                <strong>{item.count.toLocaleString("en-GB")}</strong>
              </div>
              <span className="admin-bar" aria-hidden="true">
                <span style={{ width: `${(item.count / max) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p>No signups match these filters.</p>
      )}
    </section>
  );
}
export function Filters({ filters }: { filters: AdminFilters }) {
  return (
    <form
      method="get"
      action="/admin/waitlist"
      className="admin-panel admin-filters"
      aria-label="Filter signups"
    >
      {(
        [
          ["status", "Status", statuses],
          ["gender", "Gender", genderOptions],
          ["interested_in", "Interested in", interestOptions],
          ["referred", "Referred", ["yes", "no"]],
        ] as const
      ).map(([key, label, options]) => (
        <label key={key}>
          {label}
          <select name={key} defaultValue={filters[key] || ""}>
            <option value="">All</option>
            {options.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      ))}
      <label>
        City / region
        <input
          name="city_region"
          defaultValue={filters.city_region}
          maxLength={100}
          placeholder="Exact city or region"
        />
      </label>
      <label>
        From (UTC)
        <input type="date" name="date_from" defaultValue={filters.date_from} />
      </label>
      <label>
        Through (UTC)
        <input type="date" name="date_to" defaultValue={filters.date_to} />
      </label>
      <div className="admin-actions">
        <button className="button primary" type="submit">
          Apply filters
        </button>
        <Link href="/admin/waitlist">Reset filters</Link>
      </div>
    </form>
  );
}
export function Dashboard({
  data,
  filters,
}: {
  data: DashboardData;
  filters: AdminFilters;
}) {
  const o = data.overview,
    p = data.pagination;
  const metrics = [
    ["Total signups", o.total],
    ["Today (UTC)", o.today],
    ["Last 7 days", o.last7],
    ["Last 30 days", o.last30],
    ["Total referrals", o.total_referrals],
    ["Referred signups", o.referred_signups],
    ["Entries with referrals", o.referrers],
    ["Highest referral count", o.highest_referrals],
    ["Average per referring entry", o.average_referrals],
    ["Top referral code", o.top_referral_code || "—"],
  ] as const;
  return (
    <>
      <Filters filters={filters} />
      <p className="admin-note">
        All summaries reflect the filters. Dates use UTC; 7- and 30-day periods
        include today. Referral counts are lifetime totals for matching entries.
      </p>
      <section aria-label="Waitlist overview" className="admin-metrics">
        {metrics.map(([label, value]) => (
          <div className="admin-panel" key={label}>
            <span>{label}</span>
            <strong>
              {typeof value === "number"
                ? value.toLocaleString("en-GB")
                : value}
            </strong>
          </div>
        ))}
      </section>
      <div className="admin-grid">
        <Chart title="Signups by city / region" items={data.breakdowns.city} />
        <Chart title="Gender distribution" items={data.breakdowns.gender} />
        <Chart title="Interest distribution" items={data.breakdowns.interest} />
        <Chart title="Status breakdown" items={data.breakdowns.status} />
        <Chart
          title="Referral distribution"
          items={data.breakdowns.referrals}
        />
        <Chart
          title="Signup trend · last 30 days"
          items={data.breakdowns.trend}
        />
      </div>
      <section className="admin-panel">
        <h2>Top referrers</h2>
        {data.top_referrers.length ? (
          <div
            className="admin-table"
            tabIndex={0}
            role="region"
            aria-label="Top referrers table"
          >
            <table>
              <caption>
                Up to 10 matching entries with referrals. Emails are masked.
              </caption>
              <thead>
                <tr>
                  {[
                    "Email",
                    "City / region",
                    "Referrals",
                    "Referral code",
                    "Created (UTC)",
                  ].map((label) => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.top_referrers.map((row) => (
                  <tr key={row.referral_code}>
                    <td>{row.masked_email}</td>
                    <td>{row.city_region}</td>
                    <td>{row.referral_count}</td>
                    <td>
                      <code>{row.referral_code}</code>
                    </td>
                    <td>{date(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No referring entries match these filters.</p>
        )}
      </section>
      <section className="admin-panel">
        <h2>Recent signups</h2>
        {data.recent.length ? (
          <div
            className="admin-table"
            tabIndex={0}
            role="region"
            aria-label="Recent signups table"
          >
            <table>
              <caption>Most recent first. Emails are always masked.</caption>
              <thead>
                <tr>
                  {[
                    "Created (UTC)",
                    "Email",
                    "City / region",
                    "Gender",
                    "Interested in",
                    "Status",
                    "Referrals",
                    "Referred",
                    "Heard from",
                  ].map((label) => (
                    <th scope="col" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.recent.map((row, index) => (
                  <tr key={index}>
                    <td>{date(row.created_at)}</td>
                    <td>{row.masked_email}</td>
                    <td>{row.city_region}</td>
                    <td>{row.gender}</td>
                    <td>{row.interested_in}</td>
                    <td>{row.status}</td>
                    <td>{row.referral_count}</td>
                    <td>{row.referred ? "Yes" : "No"}</td>
                    <td>{row.heard_from || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No signups match these filters.</p>
        )}
        <nav className="admin-pagination" aria-label="Signup pages">
          {p.page > 1 ? (
            <Link href={pageLink(filters, p.page - 1)}>Previous</Link>
          ) : (
            <span />
          )}
          <span>
            Page {p.page} of {p.pages} · {p.total} signups · {p.page_size} per
            page
          </span>
          {p.page < p.pages ? (
            <Link href={pageLink(filters, p.page + 1)}>Next</Link>
          ) : (
            <span />
          )}
        </nav>
      </section>
    </>
  );
}
