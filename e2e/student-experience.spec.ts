import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

async function openScreen(page: Page, screen: string) {
  await page.route("**/student-experience?*", async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    await route.fulfill({
      response,
      body: html.replace(
        "/src/main.tsx",
        "/e2e/fixtures/studentExperienceHarness.tsx",
      ),
    });
  });
  await page.goto(`/student-experience?screen=${screen}`);
}

test("activity separates upcoming, past applications, and certificates without losing drafts", async ({
  page,
}) => {
  await openScreen(page, "activity");
  const views = page.getByRole("navigation", {
    name: "参加履歴の表示切り替え",
  });
  await expect(page.locator(".application-item")).toHaveCount(3);
  await expect(
    page.locator(".application-item").filter({ hasText: "attended" }),
  ).toHaveCount(0);
  const code = page.getByLabel("確認用イベント confirmedの受付コード");
  await code.fill("123456");
  await views.getByRole("button", { name: "参加履歴", exact: true }).click();
  await expect(page.locator(".application-item")).toHaveCount(4);
  const comment = page.getByLabel("確認用イベント attendedの感想");
  await comment.fill("感想の下書き");
  await views.getByRole("button", { name: "活動証明", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "証明書を表示・共有" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "証明書を表示・共有" }).click();
  await expect(page.getByRole("dialog", { name: "活動証明書" })).toContainText(
    "AC-UI-CHECK",
  );
  await page.keyboard.press("Escape");
  await views.getByRole("button", { name: "参加履歴", exact: true }).click();
  await expect(comment).toHaveValue("感想の下書き");
  await views.getByRole("button", { name: "参加予定", exact: true }).click();
  await expect(code).toHaveValue("123456");
  await page
    .locator(".application-item")
    .filter({ hasText: "confirmed" })
    .getByRole("button", { name: "受付する" })
    .click();
  await expect(
    views.getByRole("button", { name: "参加履歴", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator(".application-item").filter({ hasText: "confirmed" }),
  ).toContainText("出席確認済み");
});

test("notifications wrap titles, filter unread, and dismiss without blocking outside actions", async ({
  page,
}) => {
  await openScreen(page, "notifications");
  const panel = page.getByRole("complementary", { name: "通知" });
  await expect(panel.locator(".notification-item")).toHaveCount(2);
  const title = panel.locator(".notification-item strong").first();
  expect(
    await title.evaluate((element) => element.getBoundingClientRect().height),
  ).toBeGreaterThan(30);
  await panel.getByRole("button", { name: "未読のみ" }).click();
  await expect(panel.locator(".notification-item")).toHaveCount(1);
  await panel.getByRole("button", { name: "すべて既読" }).click();
  await expect(panel.getByText("未読の通知はありません。")).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "過去の通知をさらに30件読み込む" }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "未読のみ" }).click();
  await expect(panel.locator(".notification-item")).toHaveCount(2);
  await page.getByRole("button", { name: "通知の外側", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("status", { name: "外側の操作回数" })).toHaveText(
    "1",
  );
  await page.getByRole("button", { name: "通知を開く", exact: true }).click();
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "通知を開く", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "通知を開く", exact: true }).click();
  const search = page.getByRole("textbox", { name: "通知の外で検索" });
  await search.click();
  await expect(panel).toHaveCount(0);
  await page.keyboard.type("会津");
  await expect(search).toHaveValue("会津");
  await expect(search).toBeFocused();
});

test("mobile chat keeps its composer visible with notices and a long draft", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openScreen(page, "chat&notice=1");
  await page.locator(".conversation-item").first().click();
  await page
    .getByRole("textbox", { name: "全体チャットにメッセージを送る" })
    .fill("1行目\n2行目\n3行目\n4行目\n5行目\n6行目");
  const send = await page
    .getByRole("button", { name: "メッセージを送信" })
    .boundingBox();
  const nav = await page
    .getByRole("navigation", { name: "メインナビゲーション" })
    .boundingBox();
  expect(send!.y + send!.height).toBeLessThanOrEqual(nav!.y);
  expect(send!.y).toBeGreaterThan(0);
});

test("chat identifies events, clears empty filters, and keeps mobile return as a line break", async ({
  page,
}) => {
  await openScreen(page, "chat");
  await expect(page.locator(".conversation-item strong").first()).toHaveText(
    "ものづくり体験",
  );
  await page
    .getByRole("textbox", { name: "チャットを検索" })
    .fill("該当しない検索");
  await page.getByRole("button", { name: "すべてのチャットを表示" }).click();
  await expect(page.locator(".conversation-item")).toHaveCount(2);
  await page.locator(".conversation-item").first().click();
  const input = page.getByRole("textbox", {
    name: "全体チャットにメッセージを送る",
  });
  await input.fill("1行目");
  const touch = await page.evaluate(
    () => matchMedia("(pointer: coarse)").matches,
  );
  await input.press(touch ? "Enter" : "Shift+Enter");
  await expect(input).toHaveValue("1行目\n");
  await expect(page.locator(".chat-message")).toHaveCount(0);
  await input.fill("1行目\n2行目");
  await page.getByRole("button", { name: "メッセージを送信" }).click();
  await expect(page.locator(".chat-message p")).toHaveText("1行目\n2行目");
  await expect(page.locator(".chat-message p")).toHaveCSS(
    "white-space",
    "pre-wrap",
  );
});

test("event details keep close and application actions visible while the body scrolls", async ({
  page,
}) => {
  await openScreen(page, "detail");
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Googleカレンダー" }),
  ).toBeDisabled();
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 834, height: 1194 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBe(viewport.width);
    if (viewport.width <= 720) {
      await expect(panel).toHaveCSS("height", `${viewport.height}px`);
    } else {
      await expect(panel).toHaveCSS("max-height", `${viewport.height - 48}px`);
    }
    const action = panel.locator(".detail-action-bar .primary-action");
    await expect
      .poll(async () => {
        const box = await action.boundingBox();
        return box!.y + box!.height <= viewport.height + 1;
      })
      .toBe(true);
    const before = await action.boundingBox();
    await panel
      .locator(
        viewport.width <= 720 ? ".detail-panel-body" : ".detail-panel-content",
      )
      .evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
    const after = await action.boundingBox();
    expect(Math.abs(before!.y - after!.y)).toBeLessThan(1);
    await expect(panel.getByTitle("閉じる")).toBeVisible();
    expect(after!.height).toBeGreaterThanOrEqual(52);
  }
});
