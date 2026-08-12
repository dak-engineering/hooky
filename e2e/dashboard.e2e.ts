import { expect, test } from "@playwright/test";

test("creates a hook, captures an event, and creates a CLI key", async ({
  page,
  request,
}) => {
  const email = `developer-${Date.now()}-${Math.random()}@example.test`;
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Dak Engineering");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await page.getByRole("button", { name: "New hook" }).click();
  await page.getByLabel("Hook name").fill("stripe-e2e");
  await page.getByRole("button", { name: "Create hook" }).click();
  await expect(
    page.getByRole("heading", { name: "Webhook URL created" }),
  ).toBeVisible();
  const ingressUrl = await page.locator(".secret-field code").textContent();
  expect(ingressUrl).toMatch(/^http:\/\/127\.0\.0\.1:3000\/e\/hk_/);

  const webhookResponse = await request.post(ingressUrl!, {
    data: { order: "ord_e2e", amount: 4999, currency: "usd" },
    headers: { "stripe-signature": "e2e-signature" },
  });
  expect(webhookResponse.status()).toBe(202);

  await page.getByRole("button", { name: "Done" }).click();
  await page.reload();
  await expect(
    page.getByRole("row", { name: /POST \/ now Pending 0/ }),
  ).toBeVisible();
  await expect(page.locator(".payload-view")).toContainText("ord_e2e");
  await expect(page.locator(".payload-view")).toContainText("4999");

  await page.getByRole("button", { name: "API keys" }).click();
  await page.getByLabel("Key name").fill("MacBook listener");
  await page.getByRole("button", { name: "Create API key" }).click();
  await expect(
    page.getByRole("heading", { name: "API key created" }),
  ).toBeVisible();
  await expect(page.locator(".secret-field code")).toContainText("hky_");
});
