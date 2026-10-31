import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { projectSuffix, projectVariant } from "./testVariants";

const fixtureImage = path.resolve("src/assets/event-community.jpg");

async function pressForwardTab(page: Page, projectName: string) {
  await page.keyboard.press(projectName === "webkit" ? "Alt+Tab" : "Tab");
}

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
      .getByRole("checkbox", { name: /18歳以上です。または16歳・17歳/ })
      .check();
    await page.getByRole("button", { name: "同意して利用を続ける" }).click();
    await expect(legalUpdateHeading).toBeHidden();
  }
}

test.describe("accessibility", () => {
  test("auth screen and legal dialog pass automated and keyboard checks", async ({
    page,
  }) => {
    await page.goto("/");
    const termsButton = page.getByRole("button", { name: "利用規約" });
    await expect(termsButton).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);

    await termsButton.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "利用規約" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("region", { name: "利用規約の本文" }),
    ).toBeFocused();
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
    await expect(
      page.getByRole("heading", { name: "イベントを探す" }),
    ).toBeVisible();
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
    await expect(
      page.getByRole("heading", { name: "参加履歴", exact: true }),
    ).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);

    const profileTab = nav.getByRole("button", { name: "プロフィール" });
    await profileTab.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("通知設定")).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);
  });

  test("student application questions keep focus and work from the keyboard", async ({
    page,
  }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);
    const variant = projectVariant(testInfo.project.name);
    const eventTitle = `E2E 申込質問イベント ${variant}`;
    await login(page, `student-e2e-${suffix}@u-aizu.ac.jp`);

    const nav = page.getByRole("navigation", { name: "メインナビゲーション" });
    const searchTab = nav.getByRole("button", { name: "探す" });
    await searchTab.focus();
    await page.keyboard.press("Enter");
    await page
      .getByRole("textbox", { name: "イベントを検索" })
      .fill(eventTitle);

    const eventTrigger = page.getByRole("button", {
      name: `${eventTitle}の詳細を見る`,
    });
    await eventTrigger.focus();
    await page.keyboard.press("Enter");
    const applyButton = page.getByRole("button", {
      name: "このイベントに参加する",
    });
    await applyButton.focus();
    await page.keyboard.press("Enter");

    const applicationDialog = page.getByRole("dialog", {
      name: "参加申請",
    });
    await expect(applicationDialog).toBeVisible();
    await expect(applicationDialog.getByTitle("閉じる")).toBeFocused();
    await applicationDialog.getByRole("button", { name: "次へ" }).click();
    await expect(applicationDialog.getByLabel("参加目的")).toBeVisible();
    await applicationDialog
      .getByLabel("参加目的")
      .fill("食物アレルギーについて相談したいです");
    await expect(applicationDialog.getByLabel("参加経験")).toBeVisible();
    await expect(
      applicationDialog.getByRole("checkbox", {
        name: /参加ルールの確認.*確認しました/,
      }),
    ).toBeVisible();
    await applicationDialog.getByLabel("参加経験").selectOption("初めて");
    await applicationDialog
      .getByRole("checkbox", { name: /参加ルールの確認.*確認しました/ })
      .check();
    await applicationDialog.getByRole("button", { name: "次へ" }).click();
    const sensitiveConsent = applicationDialog.getByRole("checkbox", {
      name: /要配慮個人情報の取得と.*への提供に同意します/,
    });
    await expect(sensitiveConsent).toBeVisible();
    await sensitiveConsent.focus();
    await expect(sensitiveConsent).toBeFocused();
    await expectNoSeriousAccessibilityViolations(page);

    await page.keyboard.press("Escape");
    const discardDialog = page.getByRole("alertdialog", {
      name: "入力内容を破棄しますか？",
    });
    await expect(discardDialog).toBeVisible();
    await discardDialog.getByRole("button", { name: "破棄して閉じる" }).click();
    await expect(applicationDialog).toBeHidden();
    await expect(eventTrigger).toBeFocused();
  });

  test("paid event shows complete terms immediately before application", async ({
    page,
  }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);
    const variant = projectVariant(testInfo.project.name);
    const eventTitle = `E2E 有料イベント ${variant}`;
    await login(page, `student-e2e-${suffix}@u-aizu.ac.jp`);

    await page
      .getByRole("navigation", { name: "メインナビゲーション" })
      .getByRole("button", { name: "探す" })
      .click();
    await page
      .getByRole("textbox", { name: "イベントを検索" })
      .fill(eventTitle);
    await page
      .getByRole("button", { name: `${eventTitle}の詳細を見る` })
      .click();
    await page.getByRole("button", { name: "このイベントに参加する" }).click();

    const applicationDialog = page.getByRole("dialog", {
      name: "参加申請",
    });
    await expect(applicationDialog).toContainText("有料イベントの最終確認");
    await expect(applicationDialog).toContainText(
      "販売・役務提供事業者：E2E主催団体",
    );
    await expect(applicationDialog).toContainText("当日会場で現金払い");
    await expect(applicationDialog).toContainText("主催者が申請を承認した時点");
    await expectNoSeriousAccessibilityViolations(page);
  });

  test("student check-in and post-event survey controls are keyboard accessible", async ({
    page,
  }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);
    const variant = projectVariant(testInfo.project.name);
    const checkInTitle = `E2E QR受付確認 ${variant}`;
    const surveyTitle = `E2E 開催後アンケート ${variant}`;
    await login(page, `student-e2e-${suffix}@u-aizu.ac.jp`);

    const activityTab = page
      .getByRole("navigation", { name: "メインナビゲーション" })
      .getByRole("button", { name: /^活動/ });
    await activityTab.focus();
    await page.keyboard.press("Enter");

    const checkInItem = page
      .locator(".application-item")
      .filter({ hasText: checkInTitle });
    const codeInput = checkInItem.getByLabel(`${checkInTitle}の受付コード`);
    await codeInput.focus();
    await codeInput.fill("246810");
    await pressForwardTab(page, testInfo.project.name);
    await expect(
      checkInItem.getByRole("button", { name: "受付する" }),
    ).toBeFocused();

    const surveyItem = page
      .locator(".application-item")
      .filter({ hasText: surveyTitle });
    const rating = surveyItem.getByLabel(`${surveyTitle}の満足度`);
    await expect(
      surveyItem.getByText("開催後アンケート", { exact: true }),
    ).toBeVisible();
    await rating.focus();
    await pressForwardTab(page, testInfo.project.name);
    await expect(surveyItem.getByLabel(`${surveyTitle}の感想`)).toBeFocused();
    await pressForwardTab(page, testInfo.project.name);
    await expect(
      surveyItem.getByRole("checkbox", { name: "友人にもおすすめしたい" }),
    ).toBeFocused();
    await pressForwardTab(page, testInfo.project.name);
    await expect(
      surveyItem.getByRole("button", { name: "アンケートを送信" }),
    ).toBeFocused();
    await expectNoSeriousAccessibilityViolations(page);
  });

  test("chat edit, delete, report, and block controls preserve keyboard focus", async ({
    page,
  }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);
    const variant = projectVariant(testInfo.project.name);
    const eventTitle = `E2E 地域交流会 ${variant}`;
    await login(page, `student-e2e-${suffix}@u-aizu.ac.jp`);

    const messagesTab = page
      .getByRole("navigation", { name: "メインナビゲーション" })
      .getByRole("button", { name: "メッセージ" });
    await messagesTab.focus();
    await page.keyboard.press("Enter");
    const roomButton = page
      .locator(".conversation-item")
      .filter({ hasText: eventTitle });
    await roomButton.focus();
    await page.keyboard.press("Enter");

    const ownMessage = page.locator('[data-message-id="student-seed-message"]');
    await expect(ownMessage).toContainText(
      "E2E 学生からの編集・削除確認用メッセージ",
    );
    const editButton = ownMessage.getByRole("button", {
      name: "メッセージを編集",
    });
    await editButton.focus();
    await page.keyboard.press("Enter");
    await expect(
      ownMessage.getByRole("textbox", { name: "メッセージを編集" }),
    ).toBeFocused();
    await expectNoSeriousAccessibilityViolations(page);
    await page.keyboard.press("Escape");
    await expect(editButton).toBeFocused();

    const deleteButton = ownMessage.getByRole("button", {
      name: "メッセージを削除",
    });
    await deleteButton.focus();
    await page.keyboard.press("Enter");
    const deleteDialog = page.getByRole("alertdialog", {
      name: "メッセージを削除しますか？",
    });
    await expect(deleteDialog).toBeVisible();
    await expect(
      deleteDialog.getByRole("button", { name: "戻る" }),
    ).toBeFocused();
    await expectNoSeriousAccessibilityViolations(page);
    await page.keyboard.press("Escape");
    await expect(deleteButton).toBeFocused();

    const otherMessage = page.locator('[data-message-id="seed-message"]');
    await expect(otherMessage).toContainText("E2E 初期メッセージ");
    const reportButton = otherMessage.getByRole("button", {
      name: /さんのメッセージを通報/,
    });
    await reportButton.focus();
    await page.keyboard.press("Enter");
    const reportDialog = page.getByRole("dialog", { name: "通報する" });
    await expect(reportDialog).toBeVisible();
    await expect(reportDialog.getByTitle("閉じる")).toBeFocused();
    await expectNoSeriousAccessibilityViolations(page);
    await page.keyboard.press("Escape");
    await expect(reportButton).toBeFocused();

    const [composerHeight, composerInputHeight] = await Promise.all([
      page
        .locator(".chat-composer")
        .evaluate((element) => element.getBoundingClientRect().height),
      page
        .locator(".chat-composer textarea")
        .evaluate((element) => element.getBoundingClientRect().height),
    ]);
    expect(composerHeight).toBeLessThanOrEqual(96);
    expect(composerInputHeight).toBeLessThanOrEqual(48);
  });

  test("organization dashboard has no serious automated violations", async ({
    page,
  }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);
    await login(page, `org-e2e-${suffix}@example.com`);
    await expect(
      page.getByRole("heading", { name: "イベント運営" }),
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
    await page.getByRole("button", { name: /^イベント/ }).click();

    const managedEvent = page
      .locator(".managed-event-row")
      .filter({ hasText: eventTitle });
    const eventTrigger = managedEvent
      .getByRole("button", { name: new RegExp(`^${eventTitle}`) })
      .first();
    await eventTrigger.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "参加者一覧" }),
    ).toBeVisible();
    await expect(page.getByText("QR受付・6桁受付コード")).toBeVisible();
    await expect(page.getByLabel("活動報告本文")).toBeVisible();
    const surveyToggle = page.locator(".event-survey-results > summary");
    await surveyToggle.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("region", { name: "開催後アンケートの回答" }).getByText("まだ回答はありません。")).toBeVisible();
    const reportRights = page.getByRole("checkbox", {
      name: /本文・写真の権利を確認し/,
    });
    await reportRights.focus();
    await expect(reportRights).toBeFocused();
    const reportPhotos = page.getByLabel("活動報告の写真");
    await reportPhotos.focus();
    await expect(reportPhotos).toBeFocused();
    await reportPhotos.setInputFiles(fixtureImage);
    await expect
      .poll(() =>
        reportPhotos.evaluate(
          (element: HTMLInputElement) => element.files?.length ?? 0,
        ),
      )
      .toBe(1);
    await expectNoSeriousAccessibilityViolations(page);

    await page.getByRole("button", { name: /団体ホーム/ }).click();
    await page.getByRole("button", { name: /^全体チャット/ }).click();
    await expect(
      page.getByPlaceholder("全体チャットにメッセージを送る"),
    ).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);
  });

  test("admin dashboard has no serious automated violations", async ({
    page,
  }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);
    await login(page, `admin-e2e-${suffix}@aizu-connect.local`, "admin123");
    await expect(
      page.getByRole("heading", { name: "イベント審査" }),
    ).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page);
  });

  test("admin review and report dialogs preserve keyboard focus", async ({
    page,
  }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);
    const variant = projectVariant(testInfo.project.name);
    await login(page, `admin-e2e-${suffix}@aizu-connect.local`, "admin123");

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
