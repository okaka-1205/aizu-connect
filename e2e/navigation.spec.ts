import { expect, test } from "@playwright/test";

test("closing event details during a list refresh keeps them closed", async ({
  page,
}) => {
  await page.route("**/navigation-regression?*", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>画面遷移の回帰確認</title></head><body><div id="root"></div><script type="module" src="/e2e/fixtures/navigationHarness.ts"></script></body></html>',
    }),
  );
  await page.goto("/navigation-regression?tab=search&event=navigation-example");
  const selected = page.getByRole("status", { name: "選択イベント" });
  await expect(selected).toHaveText("navigation-example");
  for (const label of ["空文字で閉じて一覧更新", "nullで閉じて一覧更新"]) {
    await page.getByRole("button", { name: label }).click();
    await expect(selected).toHaveText("閉じた状態");
    await expect(page).not.toHaveURL(/[?&]event=/);
    await page.getByRole("button", { name: "イベントを開く" }).click();
    await expect(selected).toHaveText("navigation-example");
    await expect(page).toHaveURL(/[?&]event=navigation-example/);
  }
});
