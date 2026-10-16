import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { projectSuffix, projectVariant } from "./testVariants";

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const violations = results.violations
    .filter(({ impact }) => impact === "critical" || impact === "serious")
    .map(({ id, impact, help, nodes }) => ({
      id,
      impact,
      help,
      targets: nodes.map(({ target }) => target.join(" ")),
    }));
  expect(violations).toEqual([]);
}

async function login(page: Page, email: string, password = "password123") {
  await page.goto("/");
  await page.getByRole("button", { name: "ログイン" }).click();
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill(password);
  await page.getByRole("button", { name: "ログインする" }).click();
  await expect(page.getByRole("heading", { name: "ログイン" })).toBeHidden();
  const legalUpdateHeading = page.getByRole("heading", {
    name: "利用条件を更新しました",
  });
  if (await legalUpdateHeading.isVisible()) {
    await page.getByRole("checkbox", { name: /両文書に同意します/ }).check();
    await page
      .getByRole("button", { name: "同意して利用を続ける" })
      .click();
    await expect(legalUpdateHeading).toBeHidden();
  }
}

test.describe("accessibility", () => {
  test("auth screen and legal dialog pass automated and keyboard checks", async ({
    page,
  }) => {
    await page.goto("/");
    await expectNoSeriousAccessibilityViolations(page);

    const termsButton = page.getByRole("button", { name: "利用規約" });
    await termsButton.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "利用規約" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("region", { name: "利用規約の本文" })).toBeFocused();
    await expectNoSeriousAccessibilityViolations(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(termsButton).toBeFocused();
  });

  test("student main screen has no serious automated violations", async ({
    page,
  }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);
    await login(page, `student-e2e-${suffix}@u-aizu.ac.jp`);
    await expect(
      page.getByRole("heading", { name: "おすすめのイベント" }),
    ).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);
  });

  test("student secondary screens and event dialog support keyboard navigation", async ({
    page,
  }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);
    await login(page, `student-e2e-${suffix}@u-aizu.ac.jp`);
    const nav = page.getByRole("navigation", { name: "メインナビゲーション" });

    const searchTab = nav.getByRole("button", { name: "探す" });
    await searchTab.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "イベントを探す" })).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);

    const eventTitle = "E2E ページングイベント 01";
    const eventTrigger = page
      .getByRole("button", { name: `${eventTitle}の詳細を見る` })
      .first();
    await eventTrigger.focus();
    await page.keyboard.press("Enter");
    const eventDialog = page.getByRole("dialog", { name: eventTitle });
    await expect(eventDialog).toBeVisible();
    expect(
      await eventDialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
    await expectNoSeriousAccessibilityViolations(page);
    await page.keyboard.press("Escape");
    await expect(eventDialog).toBeHidden();
    await expect(eventTrigger).toBeFocused();

    const activityTab = nav.getByRole("button", { name: /^活動/ });
    await activityTab.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "参加履歴", exact: true })).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);

    const profileTab = nav.getByRole("button", { name: "プロフィール" });
    await profileTab.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("通知設定")).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);
  });

  test("organization dashboard has no serious automated violations", async ({
    page,
  }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);
    await login(page, `org-e2e-${suffix}@example.com`);
    await expect(
      page.getByRole("heading", { name: "登録したイベント" }),
    ).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);
  });

  test("organization participant, check-in, reporting, and chat controls support keyboard navigation", async ({
    page,
  }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);
    const variant = projectVariant(testInfo.project.name);
    const eventTitle = `E2E 参加者管理 ${variant}`;
    await login(page, `org-e2e-${suffix}@example.com`);

    const managedEvent = page
      .locator(".managed-event-row")
      .filter({ hasText: eventTitle });
    const eventTrigger = managedEvent
      .getByRole("button", { name: new RegExp(`^${eventTitle}`) })
      .first();
    await eventTrigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "参加者一覧" })).toBeVisible();
    await expect(page.getByText("QR受付・6桁受付コード")).toBeVisible();
    await expect(page.getByLabel("活動報告本文")).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);

    const applicant = page
      .locator(".applicant-row")
      .filter({ hasText: `E2E 後参加 ${variant}` });
    const contactButton = applicant.getByRole("button", { name: "個別連絡" });
    await contactButton.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByPlaceholder("参加者にメッセージを送る"),
    ).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);
  });

  test("admin dashboard has no serious automated violations", async ({
    page,
  }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);
    await login(
      page,
      `admin-e2e-${suffix}@aizu-connect.local`,
      "admin123",
    );
    await expect(page.getByRole("heading", { name: "イベント審査" })).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);
  });

  test("admin review and report dialogs preserve keyboard focus", async ({
    page,
  }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);
    const variant = projectVariant(testInfo.project.name);
    await login(
      page,
      `admin-e2e-${suffix}@aizu-connect.local`,
      "admin123",
    );

    const eventReview = page
      .locator(".admin-review-item")
      .filter({ hasText: `E2E 管理審査イベント ${variant}` });
    const publishButton = eventReview.getByRole("button", { name: "公開する" });
    await publishButton.focus();
    await page.keyboard.press("Enter");
    const publishDialog = page.getByRole("alertdialog", {
      name: "イベントを公開しますか？",
    });
    await expect(publishDialog).toBeVisible();
    expect(
      await publishDialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
    await expectNoSeriousAccessibilityViolations(page);
    await page.keyboard.press("Escape");
    await expect(publishDialog).toBeHidden();
    await expect(publishButton).toBeFocused();

    const report = page
      .locator(".review-row")
      .filter({ hasText: `削除ユーザー通報の匿名化確認 ${variant}` });
    const completeButton = report.getByRole("button", {
      name: "対応済み",
      exact: true,
    });
    await completeButton.focus();
    await page.keyboard.press("Enter");
    const reportDialog = page.getByRole("alertdialog", {
      name: "通報を対応済みにする",
    });
    await expect(reportDialog).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);
    await page.keyboard.press("Escape");
    await expect(reportDialog).toBeHidden();
    await expect(completeButton).toBeFocused();
  });
});
