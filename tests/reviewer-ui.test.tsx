import { StrictMode } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { ReviewerConsole } from "@/components/reviewer/console";
const id = "00000000-0000-4000-8000-000000000001",
  id2 = "00000000-0000-4000-8000-000000000002";
const make = (submission_id = id) => ({
  submission_id,
  first_name: submission_id === id ? "Anu" : "Bala",
  age: 28,
  city: "Zürich",
  submitted_at: "2026-10-01T10:00:00Z",
  video_signed_url: "https://media.example/video?token=private",
  profile_photo_signed_urls: [
    "https://media.example/one?token=private",
    "https://media.example/two?token=private",
  ],
  expires_in_seconds: 300,
});
Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
  configurable: true,
  value: function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  },
});
Object.defineProperty(HTMLDialogElement.prototype, "close", {
  configurable: true,
  value: function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  },
});
let queue: ReturnType<typeof make>[];
beforeEach(() => {
  queue = [make(), make(id2)];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body);
      if (body.action === "list")
        return Response.json({ reviews: queue, more_possible: false });
      if (body.action === "get")
        return Response.json(
          queue.find((item) => item.submission_id === body.submission_id),
        );
      queue = queue.filter((item) => item.submission_id !== body.submission_id);
      return Response.json({ finalized: true });
    }),
  );
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(
    function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  );
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.removeAttribute("open");
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function ready() {
  render(
    <StrictMode>
      <ReviewerConsole />
    </StrictMode>,
  );
  await screen.findByText("Anu");
}
it("loads pending count and minimal review details without identity fields", async () => {
  await ready();
  expect(screen.getByText("2 pending")).toBeVisible();
  expect(screen.getByText("28 years")).toBeVisible();
  expect(screen.queryByText(id)).not.toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/@|1998-|private/);
  const media = document.querySelector("video")!;
  expect(media.autoplay).toBe(false);
  expect(media.controls).toBe(true);
});
it("renders empty queue", async () => {
  queue = [];
  render(<ReviewerConsole />);
  expect(await screen.findByText("No pending reviews")).toBeVisible();
  expect(screen.getByText("0 pending")).toBeVisible();
});
it("supports photos, arrows and Space play/pause", async () => {
  await ready();
  fireEvent.keyDown(document.body, { key: "ArrowRight" });
  expect(screen.getByAltText("Profile photo 2")).toHaveAttribute(
    "src",
    make().profile_photo_signed_urls[1],
  );
  fireEvent.keyDown(document.body, { key: "ArrowLeft" });
  expect(screen.getByAltText("Profile photo 1")).toBeVisible();
  fireEvent.keyDown(document.body, { key: " " });
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  const element = document.querySelector("video")!;
  vi.spyOn(element, "paused", "get").mockReturnValue(false);
  fireEvent.keyDown(document.body, { key: " " });
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1);
});
it("A approves once and automatically loads next review without reload", async () => {
  await ready();
  fireEvent.keyDown(document.body, { key: "a" });
  fireEvent.keyDown(document.body, { key: "a" });
  await screen.findByText("Bala");
  expect(screen.getByText("1 pending")).toBeVisible();
  expect(
    vi
      .mocked(fetch)
      .mock.calls.filter(
        ([, init]) => JSON.parse(init!.body as string).action === "approve",
      ),
  ).toHaveLength(1);
});
it("R opens rejection dialog, requires reason and disables action shortcuts while open", async () => {
  await ready();
  fireEvent.keyDown(document.body, { key: "r" });
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Confirm rejection" }),
  ).toBeDisabled();
  fireEvent.keyDown(document.body, { key: "a" });
  expect(queue).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("Reason"), {
    target: { value: "appearance_mismatch" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm rejection" }));
  await screen.findByText("Bala");
  const call = vi
    .mocked(fetch)
    .mock.calls.find(
      ([, init]) => JSON.parse(init!.body as string).action === "reject",
    );
  expect(JSON.parse(call![1]!.body as string).reason_code).toBe(
    "appearance_mismatch",
  );
});
it("ignores shortcuts while typing and prevents double submission while loading", async () => {
  await ready();
  const input = document.createElement("input");
  document.body.append(input);
  fireEvent.keyDown(input, { key: "a" });
  expect(queue).toHaveLength(2);
  input.remove();
  vi.mocked(fetch).mockImplementationOnce(() => new Promise(() => {}));
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
  fireEvent.keyDown(document.body, { key: "r" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("handles already-reviewed item and moves safely to the next", async () => {
  await ready();
  vi.mocked(fetch).mockImplementationOnce(async () => {
    queue.shift();
    return new Response(null, { status: 409 });
  });
  fireEvent.keyDown(document.body, { key: "a" });
  await screen.findByText("Bala");
  expect(screen.getByRole("status")).toHaveTextContent("already reviewed");
});
it("clears expired media and allows refreshing current review without persistence", async () => {
  await ready();
  const storage = vi.spyOn(Storage.prototype, "setItem");
  vi.useFakeTimers();
  await act(async () => {
    fireEvent.error(document.querySelector("video")!);
  });
  expect(document.querySelector("video")).toBeNull();
  expect(screen.getByText("Refresh media to continue")).toBeVisible();
  vi.useRealTimers();
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByText("Anu");
  expect(storage).not.toHaveBeenCalled();
});
it("clears media on expired session and gives neutral network errors", async () => {
  await ready();
  vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 401 }));
  fireEvent.keyDown(document.body, { key: "a" });
  await screen.findByText("Your session expired. Sign in again.");
  expect(document.querySelector("video")).toBeNull();
});

it("expires signed media after five minutes", async () => {
  vi.useFakeTimers();
  await act(async () => {
    render(<ReviewerConsole />);
  });
  expect(screen.getByText("Anu")).toBeVisible();
  await act(async () => {
    vi.advanceTimersByTime(300000);
  });
  expect(document.querySelector("video")).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent("Media links expired");
});

it("network failures show a neutral message without losing the current item", async () => {
  await ready();
  vi.mocked(fetch).mockRejectedValueOnce(new Error("private-url-token"));
  fireEvent.keyDown(document.body, { key: "a" });
  await screen.findByText("Could not load or save this review. Try again.");
  expect(screen.getByText("Anu")).toBeVisible();
  expect(document.body.textContent).not.toContain("private-url-token");
});
