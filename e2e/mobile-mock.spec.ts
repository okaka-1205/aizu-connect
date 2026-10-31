import { expect, test } from "@playwright/test";

test("mobile mock keeps its menu and screen navigation", async ({ page }) => {
  await page.goto("/mobile-mock");
  const title = page.locator(".mobile-mock-title-button");
  await expect(title).toHaveText("TOP");
  await expect(page.locator(".mobile-mock-menu-card")).toHaveCount(5);

  await page.getByRole("button", { name: "収穫", exact: true }).click();
  await expect(title).toHaveText("収穫");
  await expect(page.getByRole("button", { name: "スタッフ名" })).toBeVisible();
  await title.click();
  await expect(title).toHaveText("TOP");

  await page.getByRole("button", { name: "選果", exact: true }).click();
  await expect(title).toHaveText("選果");
  await expect(page.getByRole("heading", { name: "収穫情報" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "サイズ数量" })).toBeVisible();
  await expect(page.getByText("LL:", { exact: true })).toBeVisible();
  await title.click();
  await expect(page.locator(".mobile-mock-menu-card")).toHaveCount(5);
});
