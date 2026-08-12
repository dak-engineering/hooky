import { expect, test } from "@playwright/test";

test("introduces Hooky and its core promise", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response?.headers()["referrer-policy"]).toBe(
    "strict-origin-when-cross-origin",
  );

  await expect(
    page.getByRole("heading", { name: "Webhooks should wait for you." }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Hooky stores incoming webhooks and delivers them when your local environment is ready.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Follow the build on GitHub" }),
  ).toHaveAttribute("href", "https://github.com/dak-engineering/hooky");
});
