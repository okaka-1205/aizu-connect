import { expect, test } from "@playwright/test";

test.describe("auth entry", () => {
  test("shows the registration entry point and switches to login", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "アカウントを作成" }),
    ).toBeVisible();
    await expect(page.getByLabel("メールアドレス")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "アカウントを作成" }),
    ).toBeVisible();
    const legalConsent = page.getByRole("checkbox", {
      name: "利用規約とプライバシーポリシーに同意します",
    });
    await expect(legalConsent).toBeVisible();
    await expect(legalConsent).toHaveAttribute("required", "");
    await expect(page.getByLabel("メールアドレス")).toHaveAttribute(
      "required",
      "",
    );
    await expect(page.getByPlaceholder("10文字以上")).toHaveAttribute(
      "minlength",
      "10",
    );
    const accountType = page.getByRole("group", {
      name: "アカウント種別",
    });
    await expect(
      accountType.getByRole("button", { name: "個人" }),
    ).toHaveAttribute("aria-pressed", "true");
    await accountType.getByRole("button", { name: "団体・自治体" }).click();
    await expect(page.getByLabel("団体・自治体名")).toBeVisible();
    await expect(page.getByLabel("表示名")).toBeHidden();
    await accountType.getByRole("button", { name: "個人" }).click();
    await expect(page.getByLabel("表示名")).toBeVisible();

    await page.getByRole("button", { name: "ログイン" }).click();

    await expect(
      page.getByRole("heading", { name: "ログイン" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "ログインする" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "パスワードを忘れた方" }),
    ).toBeVisible();
    await expect(
      page.getByRole("group", { name: "アカウント種別" }),
    ).toBeHidden();
    await expect(legalConsent).toBeHidden();
  });

  test("opens legal documents from the auth screen", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "利用規約" }).click();
    const termsDialog = page.getByRole("dialog", { name: "利用規約" });
    const termsBody = page.getByRole("region", { name: "利用規約の本文" });
    await expect(termsDialog).toBeVisible();
    await expect(termsBody).toBeFocused();
    await expect(
      page.getByRole("heading", { name: "第1条 適用とアカウント" }),
    ).toBeVisible();
    await expect(page.getByText("2026年8月1日")).toBeVisible();
    await termsBody.press("PageDown");
    await expect
      .poll(() => termsBody.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    const legalLayout = await termsDialog.evaluate((dialog) => {
      const body = dialog.querySelector<HTMLElement>(".legal-dialog-body");
      const dialogBounds = dialog.getBoundingClientRect();
      const bodyBounds = body?.getBoundingClientRect();
      return {
        bodyBottom: Math.round(bodyBounds?.bottom ?? 0),
        dialogBottom: Math.round(dialogBounds.bottom),
      };
    });
    expect(legalLayout.bodyBottom).toBeLessThanOrEqual(
      legalLayout.dialogBottom,
    );
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
