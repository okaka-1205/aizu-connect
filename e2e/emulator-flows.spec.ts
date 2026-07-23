import { expect, test } from "@playwright/test";

const password = "password123";

async function login(page, email: string, userPassword = password) {
  await page.goto("/");
  await page.getByRole("button", { name: "ログイン" }).click();
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByRole("textbox", { name: /パスワード/ }).fill(userPassword);
  await page.getByRole("button", { name: "ログインする" }).click();
}

test.describe("emulator-backed role flows", () => {
  test("student can enter the product and navigate core tabs", async ({
    page,
  }) => {
    await login(page, "student-e2e@u-aizu.ac.jp");
    const nav = page.getByRole("navigation", { name: "メインナビゲーション" });

    await expect(
      page.getByRole("heading", { name: "あなたへのおすすめ" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "E2E 地域交流会" }).first(),
    ).toBeVisible();

    await expect(nav.getByRole("button", { name: "ホーム" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      )
      .toBe(true);

    await page.keyboard.press("Control+K");
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
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "E2E 地域交流会" }),
    ).toBeHidden();

    await nav.getByRole("button", { name: /^活動/ }).click();
    await expect(
      page.getByRole("heading", { name: "活動", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("主催者確認中")).toBeVisible();
    await page.getByRole("button", { name: "キャンセル" }).click();
    await expect(
      page.getByRole("alertdialog", {
        name: "参加申請をキャンセルしますか？",
      }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toBeHidden();

    await nav.getByRole("button", { name: "メッセージ" }).click();
    await expect(
      page.locator("p", { hasText: "E2E 初期メッセージ" }),
    ).toBeVisible();

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

  test("organization can view its dashboard, applicants, and messages", async ({
    page,
  }) => {
    await login(page, "org-e2e@example.com");

    await expect(
      page.getByRole("heading", { name: "掲載した活動" }),
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
    await expect(page.getByRole("button", { name: "承認" })).toBeVisible();
    await page.getByRole("button", { name: "見送り" }).click();
    await expect(
      page.getByRole("alertdialog", { name: "参加申請を見送りますか？" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toBeHidden();
    await expect(
      page.locator("p", { hasText: "E2E 初期メッセージ" }),
    ).toBeVisible();
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

  test("admin can review seeded queues", async ({ page }) => {
    await login(page, "admin", "admin123");

    await expect(
      page.getByRole("heading", { name: "イベント審査" }),
    ).toBeVisible();
    await expect(page.getByText("E2E 審査待ちイベント")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "アカウント審査" }),
    ).toBeVisible();
    await expect(page.getByText("E2E 承認待ち")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "通報・安全確認" }),
    ).toBeVisible();
    await expect(page.getByText("E2Eで確認する通報です。")).toBeVisible();
    await page.getByRole("button", { name: "見送る" }).click();
    await expect(
      page.getByRole("alertdialog", { name: "アカウントを見送りますか？" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toBeHidden();
  });
});
