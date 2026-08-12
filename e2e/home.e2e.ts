import { expect, test } from "@playwright/test";

test("introduces Hooky and its core promise", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response?.headers()["referrer-policy"]).toBe(
    "strict-origin-when-cross-origin",
  );

  await expect(
    page.getByRole("heading", { name: "Webhooks, on your time." }),
  ).toBeVisible();
  await expect(page.locator(".landing-hero h1")).toHaveCSS("font-size", "72px");
  await expect(page.locator(".hero-copy > p")).toHaveCSS("font-size", "20px");
  await expect(
    page.getByText(
      "Hooky receives and stores every event in the cloud, then delivers it to localhost the moment your environment is ready.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "View source" })).toHaveAttribute(
    "href",
    "https://github.com/dak-engineering/hooky",
  );
  await expect(page.getByText("Durable inbox")).toBeVisible();
  await expect(page.getByText("Localhost", { exact: true })).toBeVisible();
});

test("keeps the signal legible with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  expect(
    await page.evaluate(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);

  const rail = page.locator(".relay-rail.first i");
  await expect(rail).toBeVisible();
  await expect(rail).toHaveCSS("animation-name", "none");
  await expect(rail).toHaveCSS("opacity", "0.65");
});

test("stacks the signal cleanly on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Webhooks, on your time." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create an endpoint" }),
  ).toBeVisible();
  await expect(page.locator(".landing-hero h1")).toHaveCSS("font-size", "48px");
  await expect(page.locator(".hero-copy > p")).toHaveCSS("font-size", "18px");

  const dimensions = await page
    .locator(".relay-rail.first")
    .evaluate((rail) => {
      const rect = rail.getBoundingClientRect();
      return { height: rect.height, width: rect.width };
    });
  expect(dimensions.height).toBeGreaterThan(dimensions.width);

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
