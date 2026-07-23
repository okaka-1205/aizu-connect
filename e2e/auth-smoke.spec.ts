import { expect, test } from "@playwright/test";

test.describe("auth entry", () => {
  test("shows the registration entry point and switches to login", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "活動をはじめよう" }),
    ).toBeVisible();
    await expect(page.getByLabel("メールアドレス")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "学生として始める" }),
    ).toBeVisible();
    await expect(page.getByLabel("メールアドレス")).toHaveAttribute(
      "required",
      "",
    );
    await expect(page.getByPlaceholder("6文字以上")).toHaveAttribute(
      "minlength",
      "6",
    );

    await page.getByRole("button", { name: "ログイン" }).click();

    await expect(
      page.getByRole("heading", { name: "おかえりなさい" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "ログインする" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "パスワードを忘れた方" }),
    ).toBeVisible();
  });

  test("opens legal documents from the auth screen", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "利用規約" }).click();
    await expect(page.getByRole("dialog", { name: "利用規約" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "1. サービスの目的" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "利用規約" })).toBeHidden();

    await page.getByRole("button", { name: "プライバシーポリシー" }).click();
    await expect(
      page.getByRole("dialog", { name: "プライバシーポリシー" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "1. 取得する情報" }),
    ).toBeVisible();
  });
});
