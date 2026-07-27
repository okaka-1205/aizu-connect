import { expect, test } from "@playwright/test";

const password = "password123";

function projectVariant(projectName: string) {
  if (projectName === "mobile") return "Mobile";
  if (projectName === "tablet") return "Tablet";
  return "Desktop";
}

function projectSuffix(projectName: string) {
  return projectVariant(projectName).toLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function login(page, email: string, userPassword = password) {
  await page.goto("/");
  await page.getByRole("button", { name: "ログイン" }).click();
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill(userPassword);
  await page.getByRole("button", { name: "ログインする" }).click();
  await expect(
    page.getByRole("heading", { name: "おかえりなさい" }),
  ).toBeHidden();
}

async function openSearch(page) {
  await page
    .getByRole("navigation", { name: "メインナビゲーション" })
    .getByRole("button", { name: "探す" })
    .click();
  await expect(
    page.getByRole("textbox", { name: "イベントを検索" }),
  ).toBeVisible();
}

async function expectNoHorizontalOverflow(page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const root = document.documentElement;
        if (root.scrollWidth <= root.clientWidth) return "";
        const offenders = Array.from(document.querySelectorAll<HTMLElement>("body *"))
          .map((element) => {
            const bounds = element.getBoundingClientRect();
            return {
              element:
                element.id ||
                element.className ||
                element.tagName.toLowerCase(),
              left: Math.round(bounds.left),
              right: Math.round(bounds.right),
              width: Math.round(bounds.width),
            };
          })
          .filter(
            ({ left, right }) => left < -1 || right > root.clientWidth + 1,
          )
          .slice(0, 12);
        return JSON.stringify({
          clientWidth: root.clientWidth,
          scrollWidth: root.scrollWidth,
          offenders,
        });
      }),
    )
    .toBe("");
}

async function confirmApplication(
  page,
  {
    waitlist = false,
    message = "E2Eから参加を希望します。",
  }: { waitlist?: boolean; message?: string } = {},
) {
  const title = waitlist ? "キャンセル待ちに登録" : "参加申請を確認";
  await expect(page.getByRole("dialog", { name: title })).toBeVisible();
  await page.getByLabel("主催者へのメッセージ（任意）").fill(message);
  await page
    .getByRole("checkbox", {
      name: "イベント内容、キャンセル方針、主催者との情報共有範囲を確認しました",
    })
    .check();
  await page
    .getByRole("button", {
      name: waitlist ? "キャンセル待ちに登録" : "参加申請を送信",
      exact: true,
    })
    .click();
}

test.describe("emulator-backed role flows", () => {
  test("organization can register from the unified auth screen", async ({
    page,
  }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);
    const organizationName = `E2E新規団体 ${projectVariant(testInfo.project.name)}`;

    await page.goto("/");
    await page
      .getByRole("group", { name: "アカウント種別" })
      .getByRole("button", { name: "団体・自治体" })
      .click();
    await page
      .getByLabel("メールアドレス")
      .fill(`new-org-${suffix}@example.com`);
    await page.getByLabel("パスワード", { exact: true }).fill(password);
    await page.getByLabel("団体・自治体名").fill(organizationName);
    await page.getByRole("button", { name: "登録して始める" }).click();

    await expect(
      page.getByRole("heading", { name: "承認をお待ちください" }),
    ).toBeVisible();
    await expect(
      page.getByText(`${organizationName}さんの登録情報`),
    ).toBeVisible();
    await expect(
      page.getByText("確認が完了したら、活動を掲載できます。"),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "メインナビゲーション" }),
    ).toBeHidden();
    await expectNoHorizontalOverflow(page);
  });

  test("student can enter the product and navigate core tabs", async ({
    page,
  }) => {
    await login(page, "student-e2e@u-aizu.ac.jp");
    const nav = page.getByRole("navigation", { name: "メインナビゲーション" });

    await expect(
      page.getByRole("heading", { name: "あなたへのおすすめ" }),
    ).toBeVisible();
    await expect(page.getByText("E2E 地域交流会").first()).toBeVisible();

    await expect(nav.getByRole("button", { name: "ホーム" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      nav.getByRole("button", { name: "活動", exact: true }).locator("b"),
    ).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    await openSearch(page);
    await expect(
      page.getByRole("heading", { name: "気になる活動を探す" }),
    ).toBeVisible();
    const searchInput = page.getByRole("textbox", { name: "イベントを検索" });
    await expect(searchInput).toBeFocused();
    await searchInput.fill("存在しない活動");
    await expect(
      page.getByRole("heading", { name: "条件に合う活動が見つかりません" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "条件をリセット" }).click();
    await expect(searchInput).toHaveValue("");

    await page
      .getByRole("button", { name: "E2E 地域交流会の詳細を見る" })
      .click();
    await expect(
      page.getByRole("dialog", { name: "E2E 地域交流会" }),
    ).toBeVisible();
    await expect(page.getByText("参加すると得られること")).toBeVisible();
    await expect(page.getByText("地域の人とつながる")).toBeVisible();
    await expect(page.getByText("初参加歓迎").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "E2E 地域交流会" }),
    ).toBeHidden();

    await nav.getByRole("button", { name: /^活動/ }).click();
    await expect(
      page.getByRole("heading", { name: "活動", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("証明済み活動")).toBeVisible();
    await expect(page.getByText("活動証明 AC-app-e2e")).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: `${new Date().getFullYear()}年の活動`,
      }),
    ).toBeVisible();
    await expect(page.getByText("主催者確認中")).toBeVisible();
    const applicationItem = page
      .locator(".application-item")
      .filter({ hasText: "E2E 地域交流会" });
    await expect(
      applicationItem.getByRole("button", { name: "詳細を見る" }),
    ).toBeVisible();
    await expect(
      applicationItem.getByRole("button", { name: "連絡を見る" }),
    ).toBeVisible();
    await applicationItem.getByRole("button", { name: "キャンセル" }).click();
    await expect(
      page.getByRole("alertdialog", {
        name: "参加申請をキャンセルしますか？",
      }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toBeHidden();

    await applicationItem.getByRole("button", { name: "詳細を見る" }).click();
    await expect(
      page.getByRole("dialog", { name: "E2E 地域交流会" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await nav.getByRole("button", { name: /^活動/ }).click();
    await page
      .locator(".application-item")
      .filter({ hasText: "E2E 地域交流会" })
      .getByRole("button", { name: "連絡を見る" })
      .click();
    await expect(
      page.locator("p", { hasText: "E2E 初期メッセージ" }),
    ).toBeVisible();
    const attachmentName = `e2e-note-${projectSuffix(test.info().project.name)}.txt`;
    await page
      .locator(".chat-composer input[type=file]")
      .setInputFiles({
        name: attachmentName,
        mimeType: "text/plain",
        buffer: Buffer.from("Aizu Connect attachment test"),
      });
    await expect(page.getByRole("link", { name: new RegExp(attachmentName) }))
      .toBeVisible();
    const muteButton = page.getByRole("button", {
      name: "このチャットの通知をオフにする",
    });
    await muteButton.click();
    await expect(
      page.getByRole("button", {
        name: "このチャットの通知をオンにする",
      }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await nav.getByRole("button", { name: "プロフィール" }).click();
    await expect(page.getByText("通知設定")).toBeVisible();
    await page
      .getByRole("button", {
        name: "ログアウト この端末からログアウト",
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "おかえりなさい" }),
    ).toBeVisible();
    await expect(page.getByLabel("メールアドレス")).toHaveValue("");
    await expect(page.getByPlaceholder("6文字以上")).toHaveValue("");
    await expect(
      page.getByText("ログインしました。活動を探しにいきましょう。"),
    ).toBeHidden();
  });

  test("student can submit a new application through functions", async ({
    page,
  }, testInfo) => {
    const eventTitle = `E2E 追加募集イベント ${projectVariant(testInfo.project.name)}`;
    await login(page, "student-e2e@u-aizu.ac.jp");

    await openSearch(page);
    await page
      .getByRole("textbox", { name: "イベントを検索" })
      .fill("追加募集");
    await page
      .getByRole("button", { name: `${eventTitle}の詳細を見る` })
      .click();
    await expect(page.getByRole("dialog", { name: eventTitle })).toBeVisible();

    await page.getByRole("button", { name: "このイベントに参加する" }).click();
    await confirmApplication(page, {
      message: `${projectVariant(testInfo.project.name)}から参加します。`,
    });

    await expect(
      page.getByText(
        "参加申請を送信しました。主催者からの連絡を待ちましょう。",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "メッセージ" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: new RegExp(`^E2E主催団体 ${escapeRegExp(eventTitle)}`),
      }),
    ).toBeVisible();
    await expect(
      page.locator("p", {
        hasText: "参加申請を送信しました。主催者からの連絡をお待ちください。",
      }),
    ).toBeVisible();
  });

  test("student can open the planning dashboard and submit an event plan", async ({
    page,
  }, testInfo) => {
    const eventTitle = `E2E 学生企画 ${testInfo.project.name}`;
    await login(page, "student-e2e@u-aizu.ac.jp");

    await page.getByRole("button", { name: "企画" }).click();
    await page.getByRole("button", { name: "勉強会" }).click();
    await expect(
      page.getByRole("heading", { name: "企画したイベント" }),
    ).toBeVisible();
    const managementNav = page.getByRole("navigation", {
      name: "企画管理メニュー",
    });
    await expect(
      managementNav.getByRole("button", { name: /^企画作成 / }),
    ).toBeVisible();
    await expect(
      managementNav.getByRole("button", { name: /^イベント / }),
    ).toBeVisible();
    await expect(
      managementNav.getByRole("button", { name: /^参加者 / }),
    ).toBeVisible();
    await expect(
      managementNav.getByRole("button", { name: /^連絡 / }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "イベントを企画する" }),
    ).toBeVisible();

    const titleField = page.getByLabel("活動名");
    const summaryField = page.getByLabel("活動の概要");
    const takeawaysField = page.getByLabel(
      "参加すると得られること（1行ずつ）",
    );
    const atmosphereField = page.getByLabel("過去の雰囲気・当日の空気感");
    await expect(titleField).toHaveValue("");
    await expect(titleField).toHaveAttribute(
      "placeholder",
      "はじめての学び合い会",
    );
    await expect(summaryField).toHaveValue("");
    await expect(summaryField).toHaveAttribute(
      "placeholder",
      /テーマに興味がある人が集まり/,
    );
    await expect(takeawaysField).toHaveValue("");
    await expect(takeawaysField).toHaveAttribute(
      "placeholder",
      /新しいテーマを学ぶ/,
    );
    await expect(atmosphereField).toHaveValue("");
    await expect(atmosphereField).toHaveAttribute(
      "placeholder",
      "質問しやすい雰囲気で、知識差があっても参加できます。",
    );
    await expect
      .poll(() =>
        titleField.evaluate((element) =>
          element.matches(":placeholder-shown"),
        ),
      )
      .toBe(true);

    await titleField.fill(eventTitle);
    await summaryField.fill("学生が気軽に立ち上げる企画のE2E確認です。");
    await takeawaysField.fill(
      "新しいテーマを学ぶ\n小さな成果物を作る\n一緒に学ぶ仲間を見つける",
    );
    await atmosphereField.fill(
      "質問しやすく、初参加でも会話に入りやすい雰囲気です。",
    );
    await expect
      .poll(() =>
        titleField.evaluate((element) =>
          element.matches(":placeholder-shown"),
        ),
      )
      .toBe(false);
    await expect(page.getByLabel("初心者歓迎度")).toHaveValue("誰でも歓迎");
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    nextWeek.setHours(18, 0, 0, 0);
    await page.getByLabel("開始日時").fill(nextWeek.toISOString().slice(0, 16));
    await page.getByRole("button", { name: "企画を申請する" }).click();

    await expect(page.getByText("活動を審査へ申請しました。")).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: new RegExp(`^${escapeRegExp(eventTitle)}\\s`),
      }),
    ).toBeVisible();
  });

  test("application creates individual and event-wide chats with history", async ({
    page,
  }, testInfo) => {
    const variant = projectVariant(testInfo.project.name);
    const eventTitle = `E2E 全体チャットイベント ${variant}`;
    const email = `student-late-${projectSuffix(testInfo.project.name)}@u-aizu.ac.jp`;
    await login(page, email);

    await openSearch(page);
    await page
      .getByRole("textbox", { name: "イベントを検索" })
      .fill("全体チャットイベント");
    await page
      .getByRole("button", { name: `${eventTitle}の詳細を見る` })
      .click();
    await page.getByRole("button", { name: "このイベントに参加する" }).click();
    await confirmApplication(page);

    await expect(
      page.getByRole("heading", { name: "メッセージ" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: new RegExp(`${eventTitle}.*全体`) }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: new RegExp(`${eventTitle}.*全体`) })
      .click();
    await expect(
      page.locator("p", { hasText: "参加前からある全体チャットログ" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: new RegExp(`E2E主催団体 ${eventTitle}`),
      }),
    ).toBeVisible();
  });

  test("full events use the waitlist instead of blocking applications", async ({
    page,
  }, testInfo) => {
    const eventTitle = `E2E 満員イベント ${projectVariant(testInfo.project.name)}`;
    await login(page, "student-e2e@u-aizu.ac.jp");

    await openSearch(page);
    await page
      .getByRole("textbox", { name: "イベントを検索" })
      .fill(eventTitle);
    await page
      .getByRole("button", { name: `${eventTitle}の詳細を見る` })
      .click();
    await page.getByRole("button", { name: "キャンセル待ちに登録する" }).click();
    await confirmApplication(page, { waitlist: true });

    await expect(
      page.getByText(
        "キャンセル待ちに登録しました。空きが出たら通知します。",
      ),
    ).toBeVisible();
    const applicationItem = page
      .locator(".application-item")
      .filter({ hasText: eventTitle });
    await expect(
      applicationItem.getByText("キャンセル待ち", { exact: true }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("a cancellation promotes the next waitlisted participant", async ({
    page,
  }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);
    const eventTitle = `E2E 満員イベント ${projectVariant(testInfo.project.name)}`;

    await login(page, `student-late-${suffix}@u-aizu.ac.jp`);
    const nav = page.getByRole("navigation", {
      name: "メインナビゲーション",
    });
    await nav.getByRole("button", { name: /^活動/ }).click();
    const occupiedApplication = page
      .locator(".application-item")
      .filter({ hasText: eventTitle });
    await occupiedApplication.getByRole("button", { name: "キャンセル" }).click();
    await page
      .getByRole("alertdialog", { name: "参加申請をキャンセルしますか？" })
      .getByRole("button", { name: "申請を取り消す" })
      .click();
    await expect(
      page.getByText("参加申請をキャンセルしました。"),
    ).toBeVisible();

    await nav.getByRole("button", { name: "プロフィール" }).click();
    await page
      .getByRole("button", {
        name: "ログアウト この端末からログアウト",
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "おかえりなさい" }),
    ).toBeVisible();
    await page
      .getByLabel("メールアドレス")
      .fill("student-e2e@u-aizu.ac.jp");
    await page.getByLabel("パスワード", { exact: true }).fill(password);
    await page.getByRole("button", { name: "ログインする" }).click();
    await page
      .getByRole("navigation", { name: "メインナビゲーション" })
      .getByRole("button", { name: /^活動/ })
      .click();
    const promotedApplication = page
      .locator(".application-item")
      .filter({ hasText: eventTitle });
    await expect(
      promotedApplication.getByText("主催者確認中", { exact: true }),
    ).toBeVisible();
    await expect(promotedApplication).not.toContainText("キャンセル待ち");
    await expectNoHorizontalOverflow(page);
  });

  test("confirmed participant can check in during the event window", async ({
    page,
  }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);
    const variant = projectVariant(testInfo.project.name);
    const eventTitle = `E2E 当日受付 ${variant}`;
    await login(page, `student-late-${suffix}@u-aizu.ac.jp`);

    await page
      .getByRole("navigation", { name: "メインナビゲーション" })
      .getByRole("button", { name: /^活動/ })
      .click();
    const applicationItem = page
      .locator(".application-item")
      .filter({ hasText: eventTitle });
    await applicationItem
      .getByLabel(`${eventTitle}の受付コード`)
      .fill("654321");
    await applicationItem.getByRole("button", { name: "受付する" }).click();

    await expect(
      page.getByText("受付が完了しました。活動実績へ反映します。"),
    ).toBeVisible();
    await expect(applicationItem.getByText("出席確認済み")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("organization can view its dashboard, applicants, and messages", async ({
    page,
  }, testInfo) => {
    const eventChatTitle = `E2E 全体チャットイベント ${projectVariant(testInfo.project.name)}`;
    await login(page, "org-e2e@example.com");

    await expect(
      page.getByRole("heading", { name: "企画したイベント" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /E2E 地域交流会 .* 公開中/ }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: /E2E 地域交流会 .* 公開中/ })
      .click();
    await expect(
      page.getByRole("heading", { name: "参加者を確認" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /E2E 学生 E2E 地域交流会/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "承認", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "見送り" }).click();
    await expect(
      page.getByRole("alertdialog", { name: "参加申請を見送りますか？" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toBeHidden();
    await page
      .getByRole("button", { name: /E2E 学生 E2E 地域交流会/ })
      .click();
    await expect(
      page.locator("p", { hasText: "E2E 初期メッセージ" }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: new RegExp(`イベント全体 ${eventChatTitle}`),
      })
      .click();
    await page
      .getByRole("button", { name: "固定メッセージ・お知らせを編集" })
      .click();
    await page.getByLabel("固定メッセージ").fill("受付は18:00からです。");
    await page
      .getByLabel("主催者からのお知らせ")
      .fill("雨天時は講義棟ロビーに集合します。");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByText("受付は18:00からです。")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("pending student stays in the review state", async ({ page }) => {
    await login(page, "pending-e2e@example.com");

    await expect(
      page.getByRole("heading", { name: "承認をお待ちください" }),
    ).toBeVisible();
    await expect(
      page.getByText("確認が完了したら、イベントへの参加を始められます。"),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "メインナビゲーション" }),
    ).toBeHidden();
  });

  test("admin can review and complete moderation operations", async ({
    page,
  }, testInfo) => {
    const variant = projectVariant(testInfo.project.name);
    const deletionReason = `E2E ${variant}で管理者の削除権限と関連データを確認しました。`;
    await login(page, "admin", "admin123");

    await expect(
      page.getByRole("heading", { name: "イベント審査" }),
    ).toBeVisible();
    await expect(page.getByText("E2E 審査待ちイベント")).toBeVisible();
    const eventReviewItem = page
      .locator(".admin-review-item")
      .filter({ hasText: "E2E 審査待ちイベント" });
    await eventReviewItem.getByRole("button", { name: "内容を見る" }).click();
    await expect(
      page.getByText("E2Eで確認する学生歓迎の地域イベントです。"),
    ).toBeVisible();
    await expect(page.getByText("地域の人とつながる")).toBeVisible();
    await expect(page.getByText("少人数で話しやすく")).toBeVisible();
    await eventReviewItem.getByRole("button", { name: "公開する" }).click();
    await expect(
      page.getByRole("alertdialog", { name: "イベントを公開しますか？" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toBeHidden();
    await expect(
      page.getByRole("heading", { name: "アカウント審査" }),
    ).toBeVisible();
    await expect(page.getByText("E2E 承認待ち")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "通報・安全確認" }),
    ).toBeVisible();
    await expect(page.getByText("E2Eで確認する通報です。")).toBeVisible();
    const accountReviewItem = page
      .locator(".review-row")
      .filter({ hasText: "E2E 承認待ち" });
    await accountReviewItem.getByRole("button", { name: "見送る" }).click();
    await expect(
      page.getByRole("alertdialog", { name: "アカウントを見送る" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toBeHidden();

    const reportedEvent = page
      .locator(".review-row")
      .filter({ hasText: `E2E管理削除通報 ${variant}` });
    await reportedEvent
      .getByRole("button", { name: "対象を削除", exact: true })
      .click();
    const reportDeleteDialog = page.getByRole("alertdialog", {
      name: "通報対象イベントを削除",
    });
    await reportDeleteDialog
      .getByLabel("削除理由・対応記録")
      .fill(deletionReason);
    await reportDeleteDialog
      .getByRole("button", { name: "イベントを削除する" })
      .click();
    await expect(
      page.getByText("イベントと関連する申請・チャットを削除しました。"),
    ).toBeVisible();
    await expect(reportedEvent).toBeHidden();

    const directEvent = page
      .locator(".review-row")
      .filter({ hasText: `E2E 直接削除イベント ${variant}` });
    await directEvent.getByRole("button", { name: "削除", exact: true }).click();
    const directEventDialog = page.getByRole("alertdialog", {
      name: "イベントを完全に削除",
    });
    await directEventDialog
      .getByLabel("削除理由・対応記録")
      .fill(deletionReason);
    await directEventDialog
      .getByRole("button", { name: "イベントを削除する" })
      .click();
    await expect(
      page.getByText("イベントと関連する申請・チャットを削除しました。"),
    ).toBeVisible();
    await expect(directEvent).toBeHidden();

    const managedUser = page
      .locator(".review-row")
      .filter({ hasText: `E2E 削除対象 ${variant}` });
    await managedUser.getByRole("button", { name: "停止", exact: true }).click();
    const suspendDialog = page.getByRole("alertdialog", {
      name: "アカウントを停止",
    });
    await suspendDialog.getByLabel("停止理由").fill(deletionReason);
    await suspendDialog
      .getByRole("button", { name: "利用を停止する" })
      .click();
    await expect(page.getByText("アカウントを停止しました。")).toBeVisible();
    await page.getByRole("button", { name: "停止中", exact: true }).click();

    const suspendedUser = page
      .locator(".review-row")
      .filter({ hasText: `E2E 削除対象 ${variant}` });
    await suspendedUser
      .getByRole("button", { name: "削除", exact: true })
      .click();
    const userDeleteDialog = page.getByRole("alertdialog", {
      name: "ユーザーを完全に削除",
    });
    await userDeleteDialog
      .getByLabel("削除理由・対応記録")
      .fill(deletionReason);
    await userDeleteDialog
      .getByRole("button", { name: "ユーザーを削除する" })
      .click();
    await expect(
      page.getByText("ユーザーの認証アカウントと関連データを削除しました。"),
    ).toBeVisible();
    await expect(suspendedUser).toBeHidden();
    await expectNoHorizontalOverflow(page);
  });
});
