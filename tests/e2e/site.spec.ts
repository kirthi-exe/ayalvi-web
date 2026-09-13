import { test, expect } from "@playwright/test";
test("landing works at the target viewport", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Tamil connections.",
  );
  const cta = page.getByRole("link", { name: "Join Early Access" }).last();
  if (testInfo.project.name === "mobile") {
    const box = await cta.boundingBox();
    expect(box!.y + box!.height).toBeLessThan(page.viewportSize()!.height);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-landing.png`,
    fullPage: true,
  });
  await cta.click();
  await expect(page.getByRole("form")).toBeVisible();
  await page.getByLabel("Email address").fill("test@example.com");
  await page.getByLabel("City / Region").fill("Zürich");
  await page.getByLabel("Gender", { exact: true }).selectOption("Woman");
  await page.getByLabel("Interested in", { exact: true }).selectOption("Men");
  await page.getByLabel("I confirm that I am 18 or older.").check();
  await page.route("**/api/waitlist", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"success":true}',
    }),
  );
  await page.getByRole("button", { name: "Join the Ayalvi Waitlist" }).click();
  await expect(page).toHaveURL(/waitlist\/success/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "You're on the list.",
  );
  expect(errors).toEqual([]);
});
test("supporting pages and metadata endpoints load", async ({ request }) => {
  for (const path of [
    "/privacy",
    "/terms",
    "/community-guidelines",
    "/contact",
    "/sitemap.xml",
    "/robots.txt",
    "/opengraph-image",
  ])
    expect((await request.get(path)).status()).toBe(200);
});
