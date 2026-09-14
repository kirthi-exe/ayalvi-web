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

test("referral arrival, UTM preservation, signup and copying work", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(
    "/ref/abcdef0123?utm_source=internal&utm_campaign=referral-test",
  );
  await expect(page).toHaveURL(/\/?utm_source=internal.*#early-access/);
  await page.getByLabel("Email address").fill("referral-ui@example.com");
  await page.getByLabel("City / Region").fill("Zürich");
  await page.getByLabel("Gender", { exact: true }).selectOption("Woman");
  await page.getByLabel("Interested in", { exact: true }).selectOption("Men");
  await page.getByLabel("I confirm that I am 18 or older.").check();
  let received: Record<string, unknown> = {};
  await page.route("**/api/waitlist", (route) => {
    received = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, referralCode: "123456ABCD" }),
    });
  });
  await page.getByRole("button", { name: "Join the Ayalvi Waitlist" }).click();
  await expect(page).toHaveURL(/waitlist\/success/);
  expect(received.referral_code).toBe("ABCDEF0123");
  expect(received.utm_source).toBe("internal");
  expect(received.utm_campaign).toBe("referral-test");
  expect(received).not.toHaveProperty("referred_by");
  await expect(page.getByLabel("Your invitation link")).toHaveValue(
    /\/ref\/123456ABCD$/,
  );
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByRole("status")).toHaveText("Link copied.");
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("ayalvi:incoming-referral"),
    ),
  ).toBeNull();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("unknown and malformed referral URLs show ordinary signup without identity", async ({
  page,
}) => {
  for (const code of ["0000000000", "not-a-code"]) {
    await page.goto(`/ref/${code}`);
    await expect(page).toHaveURL(/\/#early-access$/);
    await expect(page.getByRole("form")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Tamil connections.",
    );
  }
});

test("neutral success without a code clears an old link and hides the referral panel", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    sessionStorage.setItem(
      "ayalvi:referral-receipt",
      JSON.stringify({ code: "ABCDEF0123", expires: Date.now() + 1800000 }),
    ),
  );
  await page.goto("/waitlist/success");
  await expect(page.getByLabel("Your invitation link")).toHaveValue(
    /ABCDEF0123$/,
  );
  await page.getByRole("link", { name: "Back to Ayalvi" }).click();
  await page.getByLabel("Email address").fill(" DUPLICATE@example.com ");
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
  await expect(
    page.getByText(
      "Thanks for joining Ayalvi Early Access. We’ll let you know when your region is ready for testing.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Your referral link" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy link" })).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("ayalvi:referral-receipt"),
    ),
  ).toBeNull();
  await page.reload();
  await expect(page.getByLabel("Your invitation link")).toHaveCount(0);
});
