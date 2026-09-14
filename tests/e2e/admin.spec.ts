import { createHmac } from "node:crypto";
import { test, expect } from "@playwright/test";
import { adminTestPassword } from "../support/admin-fixture";
test("admin rejects unauthenticated HTML and RSC requests", async ({
  page,
  request,
}) => {
  const response = await request.get("/admin/waitlist", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toContain("/admin/login");
  expect(await response.text()).not.toContain("te***");
  const rsc = await request.get("/admin/waitlist?_rsc=test", {
    headers: { RSC: "1" },
    maxRedirects: 0,
  });
  expect(await rsc.text()).not.toContain("te***");
  await page.goto("/admin/waitlist");
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByLabel("Admin password")).toBeVisible();
  expect((await page.content()).includes(adminTestPassword)).toBe(false);
});
test("admin signs in, shows masked dashboard without overflow and signs out", async ({
  page,
}, testInfo) => {
  const loginPage = await page.goto("/admin/login");
  expect(loginPage?.headers()["referrer-policy"]).toBe("same-origin");
  expect(loginPage?.headers()["cache-control"]).toContain("no-store");
  expect(loginPage?.headers()["x-robots-tag"]).toContain("noindex");
  await page.getByLabel("Admin password").fill("incorrect-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("form", { name: "Admin sign in" }).getByRole("alert"),
  ).toHaveText("Unable to sign in. Check your password or try again later.");
  expect(
    (await page.context().cookies()).some(
      (c) => c.name === "__Secure-ayalvi-admin",
    ),
  ).toBe(false);
  await page.getByLabel("Admin password").fill(adminTestPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/waitlist$/);
  await expect(
    page.getByRole("heading", { name: "Waitlist overview" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Recent signups table" })
      .getByText("te***@example.test"),
  ).toBeVisible();
  expect((await page.content()).includes(adminTestPassword)).toBe(false);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/admin-${page.viewportSize()?.width}.png`,
    fullPage: true,
  });
  const cookies = await page.context().cookies();
  const session = cookies.find((c) => c.name === "__Secure-ayalvi-admin");
  expect(session?.httpOnly).toBe(true);
  expect(session?.secure).toBe(true);
  expect(session?.sameSite).toBe("Strict");
  if (testInfo.project.name === "desktop") {
    const table = page.getByRole("region", { name: "Recent signups table" });
    await page.getByLabel("Select all visible rows").check();
    await page.getByRole("button", { name: "Bulk Mark Priority" }).click();
    await expect(table.locator(".admin-status")).toHaveText("priority");
    await expect(
      page.getByRole("region", { name: "Status counts" }).getByText("priority"),
    ).toBeVisible();
    await table.getByRole("button", { name: "Invite", exact: true }).click();
    await expect(table.locator(".admin-status")).toHaveText("invited");
    page.once("dialog", (dialog) => dialog.dismiss());
    await table.getByRole("button", { name: "Block", exact: true }).click();
    await expect(table.locator(".admin-status")).toHaveText("invited");
    page.once("dialog", (dialog) => dialog.accept());
    await table.getByRole("button", { name: "Block", exact: true }).click();
    await expect(table.locator(".admin-status")).toHaveText("blocked");
    await table.getByRole("button", { name: "Restore to Waiting" }).click();
    await expect(table.locator(".admin-status")).toHaveText("waiting");
  }
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.goto("/admin/waitlist");
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("admin rejects forged and expired sessions through the real route", async ({
  request,
}) => {
  const issued = Math.floor(Date.now() / 1000) - 9 * 3600;
  const payload = `v1.${issued}.${issued + 8 * 3600}.${"a".repeat(48)}`;
  const expired =
    payload +
    "." +
    createHmac("sha256", adminTestPassword)
      .update("ayalvi-admin-session-v1\0" + payload)
      .digest("hex");
  for (const token of ["invalid", expired]) {
    const response = await request.get("/admin/waitlist", {
      headers: { Cookie: `__Secure-ayalvi-admin=${token}` },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toContain("/admin/login");
    expect((await response.text()).includes("te***")).toBe(false);
  }
});
