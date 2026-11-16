import { expect, test, type Page } from "@playwright/test";
import { projectSuffix } from "./testVariants";

async function login(
  page: Page,
  projectName: string,
  role: "student" | "organization" = "student",
  sharedOrganization = false,
) {
  await page.goto("/");
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await page
    .getByLabel("メールアドレス")
    .fill(
      role === "student"
        ? `student-e2e-${projectSuffix(projectName)}@u-aizu.ac.jp`
        : sharedOrganization
          ? "org-e2e@example.com"
          : `org-e2e-${projectSuffix(projectName)}@example.com`,
    );
  await page.getByLabel("パスワード", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "ログインする" }).click();
  await expect(
    page.getByRole("heading", { name: "ログイン", exact: true }),
  ).toBeHidden();
  const legalUpdate = page.getByRole("heading", {
    name: "利用条件を更新しました",
  });
  if (await legalUpdate.isVisible()) {
    await page.getByRole("checkbox", { name: /両文書に同意します/ }).check();
    await page
      .getByRole("checkbox", { name: /18歳以上です。または16歳・17歳/ })
      .check();
    await page.getByRole("button", { name: "同意して利用を続ける" }).click();
  }
  await expect(
    page.getByRole("heading", {
      name: role === "student" ? "おすすめのイベント" : "イベント運営",
      exact: true,
    }),
  ).toBeVisible();
}

function navigation(page: Page) {
  return page.getByRole("navigation", { name: "メインナビゲーション" });
}

test.describe("mobile layout and touch interactions", () => {
  test("event images open details and saving stays independent at narrow widths", async ({
    page,
  }, testInfo) => {
    await login(page, testInfo.project.name);
    await expect(page.locator(".notice.is-success")).toHaveCount(0);
    await navigation(page)
      .getByRole("button", { name: "探す", exact: true })
      .click();

    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBe(width);
      await expect
        .poll(async () => (await page.locator(".app-content").boundingBox())?.x)
        .toBe(16);
      const content = await page.locator(".app-content").boundingBox();
      expect(content?.x).toBe(16);
      expect(content?.width).toBe(width - 32);
      await expect(page.locator(".search-results .event-card")).toHaveCount(6);

      const card = page.locator(".event-card").first();
      const save = card.locator(".save-button");
      const saveBox = await save.boundingBox();
      expect(saveBox?.width).toBeGreaterThanOrEqual(44);
      expect(saveBox?.height).toBeGreaterThanOrEqual(44);
      const initiallySaved = await save.getAttribute("aria-pressed");
      await save.click();
      await expect(save).toHaveAttribute(
        "aria-pressed",
        initiallySaved === "true" ? "false" : "true",
      );
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await save.click();
      await expect(save).toHaveAttribute("aria-pressed", initiallySaved!);

      await card.scrollIntoViewIfNeeded();
      const image = await card.locator(".event-image-wrap").boundingBox();
      expect(image).not.toBeNull();
      await page.mouse.click(image!.x + image!.width / 2, image!.y + 20);
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
  });

  test("search pages stay short and reset when the query changes", async ({
    page,
  }, testInfo) => {
    await login(page, testInfo.project.name);
    await page.setViewportSize({ width: 390, height: 844 });
    await navigation(page)
      .getByRole("button", { name: "探す", exact: true })
      .click();
    const firstTitle = await page.locator(".event-card h3").first().innerText();
    await page.getByRole("button", { name: "次のページ", exact: true }).click();
    await expect(page.locator(".event-card")).toHaveCount(6);
    await expect(page.locator(".event-card h3").first()).not.toHaveText(
      firstTitle,
    );
    await expect(
      page.getByRole("region", { name: "イベントの検索結果" }),
    ).toBeFocused();
    await expect
      .poll(() =>
        page
          .locator(".search-results")
          .evaluate((element) => element.getBoundingClientRect().top),
      )
      .toBeGreaterThanOrEqual(60);
    await page.getByRole("button", { name: "前のページ", exact: true }).click();
    await expect(page.locator(".event-card h3").first()).toHaveText(firstTitle);
    await page.getByRole("button", { name: "次のページ", exact: true }).click();
    await page
      .getByRole("textbox", { name: "イベントを検索" })
      .fill(firstTitle);
    await expect(page.locator(".event-card")).toHaveCount(1);
    await expect(page.locator(".event-card h3").first()).toHaveText(firstTitle);
    await expect(
      page.getByRole("navigation", { name: "検索結果のページ切り替え" }),
    ).toHaveCount(0);
    await page.getByRole("textbox", { name: "イベントを検索" }).fill("");
    await expect(page.locator(".event-card h3").first()).toHaveText(firstTitle);
    await expect(
      page.getByRole("button", { name: "前のページ", exact: true }),
    ).toBeDisabled();
  });

  test("profile rows share text alignment and the whole logout row responds", async ({
    page,
  }, testInfo) => {
    await login(page, testInfo.project.name);
    await page.setViewportSize({ width: 320, height: 844 });
    await navigation(page)
      .getByRole("button", { name: /プロフィール/ })
      .click();
    await expect(page.getByText("通知設定", { exact: true })).toBeVisible();
    const starts = await page
      .locator(".settings-row strong")
      .evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().left),
      );
    expect(new Set(starts).size).toBe(1);
    const activity = page.locator(".profile-activity-section");
    await expect(activity).not.toHaveAttribute("open", "");
    await activity.locator("summary").click();
    await expect(activity.locator(".mini-month")).toHaveCount(12);
    await expect(activity.locator(".mini-month").first()).toBeVisible();
    await activity.locator("summary").click();
    await page.getByRole("button", { name: "編集", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "プロフィール編集" });
    await expect(editor).toBeVisible();
    const bounds = await editor.boundingBox();
    expect(bounds?.x).toBe(0);
    expect(bounds?.width).toBe(320);
    await editor.getByRole("button", { name: "キャンセル" }).click();
    const logout = page.getByRole("button", {
      name: "ログアウト",
      exact: true,
    });
    await logout.scrollIntoViewIfNeeded();
    const row = await logout.boundingBox();
    await logout.click({
      position: { x: row!.width - 10, y: row!.height / 2 },
    });
    await expect(
      page.getByRole("heading", { name: "ログイン", exact: true }),
    ).toBeVisible();
  });

  test("chat composer stays above navigation on short mobile screens", async ({
    page,
  }, testInfo) => {
    await login(page, testInfo.project.name);
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await navigation(page)
        .getByRole("button", { name: /メッセージ/ })
        .click();
      await expect(page.locator(".chat-panel")).toBeVisible();
      const composer = page.locator(".chat-composer textarea");
      await composer.fill("入力欄の確認\n2行目\n3行目\n4行目\n5行目");
      const nav = await navigation(page).boundingBox();
      const send = await page
        .getByRole("button", { name: "メッセージを送信" })
        .boundingBox();
      expect(send!.y + send!.height).toBeLessThanOrEqual(nav!.y);
      expect(send!.height).toBeGreaterThanOrEqual(44);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBe(viewport.width);
      await composer.fill("");
    }
  });
});

test("organization events use ten rows per page and reset on search and sort", async ({
  page,
}, testInfo) => {
  await login(page, testInfo.project.name, "organization", true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /^イベント/ }).click();
  const rows = page.locator(".managed-event-row");
  const pages = page.getByRole("navigation", {
    name: "企画したイベントのページ切り替え",
  });
  await expect(rows).toHaveCount(10);
  const firstTitle = await rows.first().locator("strong").innerText();
  await pages.getByRole("button", { name: "次のページ" }).click();
  await expect(rows).toHaveCount(10);
  await expect(rows.first().locator("strong")).not.toHaveText(firstTitle);
  await expect(
    page.getByRole("region", { name: "企画したイベント", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("textbox", { name: "企画したイベントを検索" })
    .fill(firstTitle);
  await expect(rows).toHaveCount(1);
  await expect(pages).toHaveCount(0);
  await page.getByRole("textbox", { name: "企画したイベントを検索" }).fill("");
  await expect(rows.first().locator("strong")).toHaveText(firstTitle);
  await pages.getByRole("button", { name: "次のページ" }).click();
  await page
    .getByRole("combobox", { name: "イベントを並び替える" })
    .selectOption("newest");
  await expect(pages.locator("strong")).toHaveText(/^1 \/ /);
  await page
    .getByRole("button", { name: "過去のイベントをさらに50件読み込む" })
    .click();
  await expect(rows).toHaveCount(10);
  await expect(pages.locator("small")).not.toContainText("/ 50件");
  await page
    .getByRole("textbox", { name: "企画したイベントを検索" })
    .fill("存在しない企画名");
  await expect(
    page.getByText("条件に一致する企画はありません。"),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "企画したイベントを検索" }).fill("");
  await page.setViewportSize({ width: 320, height: 568 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBe(320);
});

test("profile protects changed drafts on cancel, Escape and browser back", async ({
  page,
}, testInfo) => {
  await login(page, testInfo.project.name);
  await page.setViewportSize({ width: 390, height: 844 });
  await navigation(page)
    .getByRole("button", { name: /プロフィール/ })
    .click();
  const edit = page.getByRole("button", { name: "編集", exact: true });
  const editor = page.getByRole("dialog", { name: "プロフィール編集" });
  const discard = page.getByRole("alertdialog", {
    name: "変更を破棄しますか？",
  });
  await edit.click();
  await editor.getByRole("button", { name: "キャンセル" }).click();
  await expect(editor).toHaveCount(0);
  await expect(discard).toHaveCount(0);
  await expect(edit).toBeFocused();
  await edit.click();
  const name = editor.getByRole("textbox", { name: "表示名", exact: true });
  const originalName = await name.inputValue();
  await name.fill("保存前のプロフィール");
  await page.keyboard.press("Control+k");
  await expect(editor).toBeVisible();
  await expect(name).toHaveValue("保存前のプロフィール");
  await editor.getByRole("button", { name: "キャンセル" }).click();
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: "戻る", exact: true }).click();
  await expect(name).toHaveValue("保存前のプロフィール");
  await page.keyboard.press("Escape");
  await expect(discard).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(discard).toHaveCount(0);
  await expect(editor).toBeVisible();
  await page.goBack();
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: "変更を破棄する" }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.locator(".profile-copy h1")).toHaveText(originalName);
  await expect(edit).toBeFocused();
  await edit.click();
  await expect(name).toHaveValue(originalName);
  await editor.getByRole("button", { name: "キャンセル" }).click();
  await expect(editor).toHaveCount(0);
});

test("message actions stay compact, dismiss outside and fit a short screen", async ({
  page,
}, testInfo) => {
  await login(page, testInfo.project.name);
  await page.setViewportSize({ width: 320, height: 568 });
  await navigation(page)
    .getByRole("button", { name: /メッセージ/ })
    .click();
  const message = page.locator('[data-message-id="student-seed-message"]');
  const trigger = message.getByRole("button", { name: "自分のメッセージ操作" });
  await trigger.click();
  const menu = page.getByRole("menu", { name: "自分のメッセージ操作" });
  await expect(menu.getByRole("menuitem")).toHaveCount(2);
  const bounds = await menu.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(568);
  await page
    .getByRole("textbox", { name: "全体チャットにメッセージを送る" })
    .click();
  await expect(menu).toHaveCount(0);
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "メッセージを編集" }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "メッセージを削除" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(menu).toHaveCount(0);
});
