vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Home from "@/app/page";
import { WaitlistForm } from "@/components/waitlist/form";
it("renders core content and the mobile hero CTA", () => {
  render(<Home />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Tamil connections.Modern dating.Shared roots.",
  );
  const cta = screen.getByRole("link", { name: /Join Early Access/ });
  expect(cta).toHaveAttribute("href", "#early-access");
  expect(cta).toBeVisible();
  expect(
    screen.getByRole("heading", { name: /Be one of the first/ }),
  ).toBeInTheDocument();
});
it("provides accessible labels and feedback", () => {
  render(<WaitlistForm />);
  for (const label of [
    "Email address",
    "City / Region",
    "Gender",
    "Interested in",
    "I confirm that I am 18 or older.",
  ])
    expect(screen.getByLabelText(label)).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  expect(screen.getByLabelText("Leave this empty")).toHaveAttribute(
    "tabindex",
    "-1",
  );
});
it("associates server errors with the field and restores the button", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        message: "Please check the highlighted fields.",
        errors: { email: "Enter a valid email address." },
      }),
    }),
  );
  render(<WaitlistForm />);
  fireEvent.submit(screen.getByRole("form"));
  await waitFor(() =>
    expect(screen.getByLabelText("Email address")).toHaveAttribute(
      "aria-invalid",
      "true",
    ),
  );
  expect(screen.getByLabelText("Email address")).toHaveAccessibleDescription(
    "Enter a valid email address.",
  );
  expect(screen.getByRole("button")).toBeEnabled();
  vi.unstubAllGlobals();
});
