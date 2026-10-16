import { expect, test } from "@playwright/test";
import { projectSuffix, projectVariant } from "./testVariants";

const password = "password123";

async function login(page, email: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "ログイン" }).click();
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill(password);
  await page.getByRole("button", { name: "ログインする" }).click();
  await expect(page.getByRole("heading", { name: "ログイン" })).toBeHidden();
}

async function expectNoHorizontalOverflow(page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const root = document.documentElement;
        return root.scrollWidth <= root.clientWidth;
      }),
    )
    .toBe(true);
}

test.describe("lightweight emulator auth flows", () => {
  test("Aizu student is active at registration and waits only for email verification", async ({
    page,
  }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);

    await page.goto("/");
    await page
      .getByLabel("メールアドレス")
      .fill(`new-aizu-student-${suffix}@u-aizu.ac.jp`);
    await page.getByLabel("パスワード", { exact: true }).fill(password);
    await page.getByLabel("表示名").fill(`会津大学学生 ${suffix}`);
    await page
      .getByRole("checkbox", {
        name: "利用規約とプライバシーポリシーに同意します",
      })
      .check();
    await page.getByRole("button", { name: "アカウントを作成" }).click();

    await expect(
      page.getByRole("heading", { name: "メールを確認してください" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "運営が登録内容を確認しています" }),
    ).toBeHidden();
    await expectNoHorizontalOverflow(page);
  });

  test("verified external student waits for admin review", async ({
    page,
  }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);
    await login(page, `student-auth-${suffix}@example.com`);

    await expect(
      page.getByRole("heading", { name: "運営が登録内容を確認しています" }),
    ).toBeVisible();
    await expect(page.locator(".approval-pending-card")).toContainText(
      `認証テスト学生 ${suffix}`,
    );
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test("an auth session without a profile is signed out safely", async ({
    page,
  }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);

    await page.goto("/");
    await page.getByRole("button", { name: "ログイン" }).click();
    await page
      .getByLabel("メールアドレス")
      .fill(`orphan-auth-${suffix}@example.com`);
    await page.getByLabel("パスワード", { exact: true }).fill(password);
    await page.getByRole("button", { name: "ログインする" }).click();

    await expect(
      page.getByText("アカウント情報を準備しています。しばらくお待ちください。"),
    ).toBeVisible();
    await expect(
      page.getByText(
        "アカウント情報が見つかりませんでした。削除済みのアカウント、または登録が完了していない可能性があります。管理者へお問い合わせください。",
      ),
    ).toBeVisible({ timeout: 12_000 });
    await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
  });

  test("organization registration keeps the admin review flow", async ({
    page,
  }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);
    const organizationName = `認証テスト団体 ${projectVariant(testInfo.project.name)}`;

    await page.goto("/");
    await page
      .getByRole("group", { name: "アカウント種別" })
      .getByRole("button", { name: "団体・自治体" })
      .click();
    await page
      .getByLabel("メールアドレス")
      .fill(`new-auth-org-${suffix}@example.com`);
    await page.getByLabel("パスワード", { exact: true }).fill(password);
    await page.getByLabel("団体・自治体名").fill(organizationName);
    await page
      .getByRole("checkbox", {
        name: "利用規約とプライバシーポリシーに同意します",
      })
      .check();
    await page.getByRole("button", { name: "アカウントを作成" }).click();

    await expect(
      page.getByRole("heading", { name: "運営が登録内容を確認しています" }),
    ).toBeVisible();
    await expect(page.locator(".approval-pending-card")).toContainText(
      organizationName,
    );
    await expectNoHorizontalOverflow(page);
  });
});
