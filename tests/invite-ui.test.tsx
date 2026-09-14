import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
import { EntryControls } from "@/components/admin/entry-controls";
import { adminFixture } from "./support/admin-fixture";
const first = adminFixture.recent[0];
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ success: true }) }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mocks.refresh.mockClear();
});
it("shows allowed row actions and never renders UUIDs as visible text", () => {
  render(<EntryControls rows={[first]} />);
  const table = screen.getByRole("table");
  expect(
    within(table).getByRole("button", { name: "Mark Priority" }),
  ).toBeVisible();
  expect(within(table).getByRole("button", { name: "Invite" })).toBeVisible();
  expect(
    within(table).queryByRole("button", { name: "Mark Beta" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(first.entry_key)).not.toBeInTheDocument();
});
it("requires confirmation to block and preserves the row when cancelled", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<EntryControls rows={[first]} />);
  fireEvent.click(screen.getByRole("button", { name: "Block" }));
  expect(confirm).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Block" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(
    JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
      .confirmed_block,
  ).toBe(true);
});
it("selects only visible rows, submits bounded batch and refreshes status metrics", async () => {
  render(
    <EntryControls
      rows={[
        first,
        { ...first, entry_key: "00000000-0000-4000-8000-000000000002" },
      ]}
    />,
  );
  fireEvent.click(screen.getByLabelText("Select all visible rows"));
  fireEvent.click(screen.getByRole("button", { name: "Bulk Invite" }));
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
  const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
  expect(body.entries).toHaveLength(2);
  expect(body.target).toBe("invited");
  expect(screen.getByRole("status")).toHaveTextContent(
    "Status updated. No invitation email was sent.",
  );
  expect(screen.getByLabelText("Select row 1")).not.toBeChecked();
});
it("disables ineligible bulk actions and updates controls from refreshed status", () => {
  const { rerender } = render(
    <EntryControls rows={[{ ...first, status: "blocked" }]} />,
  );
  fireEvent.click(screen.getByLabelText("Select row 1"));
  expect(screen.getByRole("button", { name: "Bulk Invite" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Restore to Waiting" }),
  ).toBeVisible();
  rerender(<EntryControls rows={[{ ...first, status: "invited" }]} />);
  expect(screen.getByRole("button", { name: "Mark Beta" })).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Restore to Waiting" }),
  ).not.toBeInTheDocument();
});
it("shows loading and safe failure feedback without raw errors", async () => {
  let finish!: (value: Response) => void;
  vi.mocked(fetch).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }) as Promise<Response>,
  );
  render(<EntryControls rows={[first]} />);
  fireEvent.click(screen.getByRole("button", { name: "Invite" }));
  expect(screen.getByRole("button", { name: "Block" })).toBeDisabled();
  finish(new Response(null, { status: 409 }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not update the selection.",
    ),
  );
  expect(mocks.refresh).not.toHaveBeenCalled();
});
