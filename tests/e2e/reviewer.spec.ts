import { test, expect } from "@playwright/test";
test("reviewer page and gateway deny signed-out requests", async ({
  page,
  request,
}) => {
  const response = await request.post("/admin/verifications/review", {
    data: { action: "list" },
    headers: { origin: "http://localhost:3100" },
  });
  expect(response.status()).toBe(401);
  expect(await response.text()).not.toContain("signed_url");
  await page.goto("/admin/verifications");
  await expect(page).toHaveURL(/\/admin\/verifications\/login$/);
});
test("reviewer signs in and processes a synthetic queue with keyboard controls", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "Desktop-only synthetic workflow; privacy checks run on both viewports.",
  );
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto("/admin/verifications/login");
  await page.getByLabel("Email", { exact: true }).fill("reviewer@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("reviewer-fixture-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/verifications$/);
  await expect(page.getByText("Anu", { exact: true })).toBeVisible();
  await expect(page.getByText("2 pending")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(await page.locator("video").getAttribute("autoplay")).toBeNull();
  const approveBox = await page
    .getByRole("button", { name: "Approve", exact: true })
    .boundingBox();
  expect(approveBox!.y + approveBox!.height).toBeLessThan(1080);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByAltText("Profile photo 2")).toBeVisible();
  await page.screenshot({
    path: "test-results/reviewer-desktop.png",
    fullPage: true,
  });
  await page.keyboard.press("a");
  await expect(page.getByText("Bala", { exact: true })).toBeVisible();
  await page.keyboard.press("r");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm rejection" }),
  ).toBeDisabled();
  await page
    .getByLabel("Reason", { exact: true })
    .selectOption("video_unclear");
  await page.getByRole("button", { name: "Confirm rejection" }).click();
  await expect(
    page.getByText("No pending reviews", { exact: true }),
  ).toBeVisible();
  const stored = await page.evaluate(() => ({
    local: Object.values(localStorage),
    session: Object.values(sessionStorage),
  }));
  expect(JSON.stringify(stored)).not.toContain("token=");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/verifications\/login$/);
});
