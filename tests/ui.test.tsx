vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import { it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { Header, Footer } from "@/components/layout/site";
import Home from "@/app/page";
import { WaitlistForm } from "@/components/waitlist/form";
it("explains distinct Dating and Friends contexts with shared privacy", () => {
  render(<Home />);
  const dating = screen.getByRole("article", { name: "Dating" });
  const friends = screen.getByRole("article", { name: "Friends" });
  expect(dating).toHaveClass("connection-dating");
  expect(friends).toHaveClass("connection-friends");
  expect(dating).toHaveTextContent(/Like.*match/);
  expect(friends).toHaveTextContent(/Connect.*connection/);
  expect(friends).not.toHaveTextContent(/match/i);
  expect(
    screen.getByText(/Choose Dating, Friends, or Both. Modern/),
  ).toBeVisible();
  expect(screen.getByText(/Profiles show no photos/)).toHaveTextContent(
    /mutual Dating match or Friends connection/,
  );
  expect(screen.getByText(/a short live video/)).toHaveTextContent(
    /manually reviewed/,
  );
  expect(document.body.textContent).not.toMatch(
    /identity verified|age verified|biometric|AI face matching/i,
  );
});
it("preserves the wordmark and keeps admin routes out of public navigation", () => {
  render(
    <>
      <Header />
      <Footer />
    </>,
  );
  const logos = screen.getAllByLabelText("Ayalvi", { selector: "span" });
  expect(logos).toHaveLength(2);
  for (const logo of logos) {
    expect(logo).toHaveClass("wordmark");
    expect(logo.textContent).toBe("AYALVI.");
    expect(logo.querySelector(".wordmark-dot")).toHaveTextContent(".");
  }
  const nav = screen.getByRole("navigation", { name: "Main navigation" });
  expect(
    within(nav).getByRole("link", { name: "How it works" }),
  ).toHaveAttribute("href", "/#how-it-works");
  for (const link of screen.getAllByRole("link"))
    expect(link.getAttribute("href")).not.toMatch(/^\/admin/);
});
it("renders core content and the mobile hero CTA", () => {
  render(<Home />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    /Meaningful Tamil.*connections.*start here/,
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
    "Dating preference",
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
