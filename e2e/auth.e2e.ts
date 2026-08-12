import { expect, test } from "@playwright/test";

test("uses the full viewport as an intentional auth composition", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/sign-in");

  await expect(
    page.getByRole("heading", { name: "Continue to Hooky." }),
  ).toBeVisible();
  await expect(page.getByText("Local ports stay private")).toBeVisible();

  const geometry = await page.locator(".auth-main").evaluate((main) => {
    const footer = main.querySelector(".auth-footer");
    const mainRect = main.getBoundingClientRect();
    const footerRect = footer?.getBoundingClientRect();

    return {
      mainBottom: Math.round(mainRect.bottom),
      mainHeight: Math.round(mainRect.height),
      footerBottom: footerRect ? Math.round(footerRect.bottom) : 0,
      viewportHeight: window.innerHeight,
      pageHeight: document.documentElement.scrollHeight,
    };
  });

  expect(geometry.mainHeight).toBe(976);
  expect(geometry.mainBottom).toBe(988);
  expect(geometry.footerBottom).toBeLessThanOrEqual(geometry.mainBottom - 18);
  expect(geometry.pageHeight).toBe(geometry.viewportHeight);
});
