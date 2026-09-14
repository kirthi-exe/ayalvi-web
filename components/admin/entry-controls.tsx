"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RecentEntry } from "@/lib/admin/data";
import {
  transitions,
  actionLabels,
  type Status,
  MAX_BATCH,
} from "@/lib/admin/transitions";
const date = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
export function EntryControls({ rows }: { rows: RecentEntry[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);
  const busy = sending || refreshing;
  const chosen = rows.filter((row) => selected.includes(row.entry_key));
  const allSelected = rows.length > 0 && chosen.length === rows.length;
  function allowed(row: RecentEntry, target: Status) {
    return transitions[row.status as Status]?.includes(target) ?? false;
  }
  async function apply(entries: RecentEntry[], target: Status) {
    if (busy || !entries.length) return;
    if (
      target === "blocked" &&
      !window.confirm(
        "Block this waitlist entry? It will be excluded from invitations until restored to Waiting.",
      )
    )
      return;
    setSending(true);
    setFailed(false);
    setFeedback("Updating status…");
    try {
      const response = await fetch("/admin/waitlist/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entries: entries.map((row) => ({
            id: row.entry_key,
            expected_status: row.status,
          })),
          target,
          ...(target === "blocked" ? { confirmed_block: true } : {}),
        }),
      });
      if (!response.ok) throw new Error("Unavailable");
      const result = await response.json();
      if (result.success !== true) throw new Error("Unavailable");
      setSelected([]);
      setFeedback("Status updated. No invitation email was sent.");
      startTransition(() => router.refresh());
    } catch {
      setFailed(true);
      setFeedback("Could not update the selection. Refresh and try again.");
    } finally {
      setSending(false);
    }
  }
  return (
    <>
      <p className="admin-note">
        Invites prepare status only. No invitation emails are sent.
      </p>
      <div className="admin-actions admin-bulk">
        <label>
          <input
            type="checkbox"
            checked={allSelected}
            disabled={busy || !rows.length}
            onChange={() =>
              setSelected(allSelected ? [] : rows.map((row) => row.entry_key))
            }
          />{" "}
          Select all visible rows
        </label>
        <span>
          {chosen.length} selected · maximum {MAX_BATCH}
        </span>
        {(["priority", "invited"] as const).map((target) => (
          <button
            className="button small"
            key={target}
            disabled={
              busy ||
              !chosen.length ||
              chosen.some((row) => !allowed(row, target))
            }
            onClick={() => apply(chosen, target)}
          >
            Bulk {actionLabels[target]}
          </button>
        ))}
      </div>
      <p role={failed ? "alert" : "status"} aria-live="polite">
        {feedback}
      </p>
      {rows.length ? (
        <div
          className="admin-table"
          tabIndex={0}
          role="region"
          aria-label="Recent signups table"
        >
          <table>
            <caption>
              Current page only. Emails are masked. Dates use UTC.
            </caption>
            <thead>
              <tr>
                {[
                  "Select",
                  "Created (UTC)",
                  "Email",
                  "City / region",
                  "Gender",
                  "Interested in",
                  "Status",
                  "Actions",
                  "Referrals",
                  "Referred",
                  "Heard from",
                  "First invited (UTC)",
                  "First beta (UTC)",
                ].map((label) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.entry_key}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select row ${index + 1}`}
                      disabled={busy}
                      checked={selected.includes(row.entry_key)}
                      onChange={() =>
                        setSelected((current) =>
                          current.includes(row.entry_key)
                            ? current.filter((id) => id !== row.entry_key)
                            : [...current, row.entry_key],
                        )
                      }
                    />
                  </td>
                  <td>{date(row.created_at)}</td>
                  <td>{row.masked_email}</td>
                  <td>{row.city_region}</td>
                  <td>{row.gender}</td>
                  <td>{row.interested_in}</td>
                  <td>
                    <span className="admin-status">{row.status}</span>
                  </td>
                  <td>
                    <div className="admin-row-actions">
                      {(transitions[row.status as Status] || []).map(
                        (target) => (
                          <button
                            type="button"
                            className="button small"
                            key={target}
                            disabled={busy}
                            onClick={() => apply([row], target)}
                          >
                            {actionLabels[target]}
                          </button>
                        ),
                      )}
                    </div>
                  </td>
                  <td>{row.referral_count}</td>
                  <td>{row.referred ? "Yes" : "No"}</td>
                  <td>{row.heard_from || "—"}</td>
                  <td>{row.invited_at ? date(row.invited_at) : "—"}</td>
                  <td>{row.beta_at ? date(row.beta_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No signups match these filters.</p>
      )}
    </>
  );
}
