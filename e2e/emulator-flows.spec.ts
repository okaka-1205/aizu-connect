import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import ts from "typescript";
import { projectSuffix, projectVariant } from "./testVariants";
import {
  installEngagementFailures,
  failEngagementOperation,
  rejectEngagementOperation,
  clearEngagementFailure,
} from "./engagementTestHelpers";

const password = "password123";
const fixtureImage = path.resolve("src/assets/event-community.jpg");

async function installChatSendFailures(page: Page) {
  await page.route(
    /\/src\/repositories\/chatRepository\.ts(?:\?.*)?$/,
    async (route) => {
      const response = await route.fetch();
      const source = await response.text();
      const ast = ts.createSourceFile(
        "chatRepository.js",
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JS,
      );
      let initializer: ts.Expression | undefined;
      function visit(node: ts.Node) {
        if (
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.name.text === "sendChatTextMessage"
        )
          initializer = node.initializer;
        ts.forEachChild(node, visit);
      }
      visit(ast);
      if (!initializer)
        throw new Error("Chat sender is unavailable for failure testing.");
      const replacement = `(...args) => {
      const mode = document.documentElement.dataset.chatSendFailure;
      if (mode) {
        delete document.documentElement.dataset.chatSendFailure;
        const error = new Error("送信エラーの復元確認 " + mode);
        if (mode === "deferred") {
          return new Promise((_, reject) => document.addEventListener("aizu-test:chat-send-error", () => reject(error), { once: true }));
        }
        return Promise.reject(error);
      }
      return (${initializer.getText(ast)})(...args);
    }`;
      await route.fulfill({
        response,
        body:
          source.slice(0, initializer.getStart(ast)) +
          replacement +
          source.slice(initializer.end),
      });
    },
  );
}

async function verifyChatDraftRecovery(
  page: Page,
  label: string,
  leaveAndReturn: () => Promise<void>,
) {
  const input = page.getByPlaceholder("全体チャットにメッセージを送る");
  const send = page.getByRole("button", { name: "メッセージを送信" });
  const draft = `${label}の未送信の下書き`;
  await input.fill(draft);
  await leaveAndReturn();
  await expect(input).toHaveValue(draft);

  await page.evaluate(() => {
    document.documentElement.dataset.chatSendFailure = "immediate";
  });
  await send.click();
  await expect(page.getByRole("alert")).toContainText(
    "送信エラーの復元確認 immediate",
  );
  await expect(input).toHaveValue(draft);
  await expect(page.locator(".chat-message p", { hasText: draft })).toHaveCount(
    0,
  );

  await page.evaluate(() => {
    document.documentElement.dataset.chatSendFailure = "deferred";
  });
  await send.click();
  await expect(input).toHaveValue("");
  const nextDraft = `${label}の新しい下書き`;
  await input.fill(nextDraft);
  await page.evaluate(() =>
    document.dispatchEvent(new Event("aizu-test:chat-send-error")),
  );
  await expect(page.getByRole("alert")).toContainText(
    "送信エラーの復元確認 deferred",
  );
  await expect(input).toHaveValue(nextDraft);
  await input.fill("");
  const closeNotice = page.getByRole("button", { name: "お知らせを閉じる" });
  if (await closeNotice.isVisible()) await closeNotice.click();
}

function studentEmail(projectName: string) {
  return `student-e2e-${projectSuffix(projectName)}@u-aizu.ac.jp`;
}

function organizationEmail(projectName: string) {
  return `org-e2e-${projectSuffix(projectName)}@example.com`;
}

function adminEmail(projectName: string) {
  return `admin-e2e-${projectSuffix(projectName)}@aizu-connect.local`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeBrowserDownloadFilename(value: string) {
  return value.normalize("NFC").replace(/[ _]+/g, " ");
}

async function login(page, email: string, userPassword = password) {
  await page.goto("/");
  await page.getByRole("button", { name: "ログイン" }).click();
  const loginHeading = page.getByRole("heading", { name: "ログイン" });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.getByLabel("メールアドレス").fill(email);
    await page.getByLabel("パスワード", { exact: true }).fill(userPassword);
    await page.getByRole("button", { name: "ログインする" }).click();
    try {
      await expect(loginHeading).toBeHidden({ timeout: 5_000 });
      break;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  const legalUpdateHeading = page.getByRole("heading", {
    name: "利用条件を更新しました",
  });
  if (await legalUpdateHeading.isVisible()) {
    await page.getByRole("checkbox", { name: /両文書に同意します/ }).check();
    await page
      .getByRole("checkbox", { name: /18歳以上です。または16歳・17歳/ })
      .check();
    const continueButton = page.getByRole("button", {
      name: "同意して利用を続ける",
    });
    try {
      await continueButton.click({ timeout: 3_000 });
    } catch (error) {
      if (await legalUpdateHeading.isVisible()) throw error;
    }
    await expect(legalUpdateHeading).toBeHidden();
  }
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
        const offenders = Array.from(
          document.querySelectorAll<HTMLElement>("body *"),
        )
          .map((element) => {
            const bounds = element.getBoundingClientRect();
            return {
              element:
                element.id ||
                element.className ||
                element.tagName.toLowerCase(),
              text: element.textContent
                ?.trim()
                .replace(/\s+/g, " ")
                .slice(0, 80),
              left: Math.round(bounds.left),
              right: Math.round(bounds.right),
              top: Math.round(bounds.top),
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

async function callEmulatedFunction(
  page: Page,
  functionName: string,
  data: Record<string, unknown>,
) {
  const projectId =
    process.env.VITE_FIREBASE_PROJECT_ID ?? "demo-aizu-connect-e2e";
  const port = process.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT ?? "5001";
  return page.evaluate(
    async ({
      projectId: browserProjectId,
      port: browserPort,
      name,
      payload,
    }) => {
      const { auth } = await import("/src/lib/firebase.ts");
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Authentication token is unavailable.");
      const response = await fetch(
        `http://127.0.0.1:${browserPort}/${browserProjectId}/asia-northeast1/${name}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ data: payload }),
        },
      );
      return {
        ok: response.ok,
        body: (await response.json()) as {
          result?: Record<string, unknown>;
          error?: { status?: string; message?: string };
        },
      };
    },
    { projectId, port, name: functionName, payload: data },
  );
}

async function readFirestoreDocument(pathname: string) {
  const projectId =
    process.env.VITE_FIREBASE_PROJECT_ID ?? "demo-aizu-connect-e2e";
  const port = process.env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT ?? "8080";
  const response = await fetch(
    `http://127.0.0.1:${port}/v1/projects/${projectId}/databases/(default)/documents/${pathname}`,
    { headers: { Authorization: "Bearer owner" } },
  );
  if (!response.ok)
    throw new Error(`Firestore read failed: ${response.status}`);
  return (await response.json()) as {
    fields?: Record<string, { stringValue?: string; integerValue?: string }>;
  };
}

async function writeFirestoreDocument(
  pathname: string,
  fields: Record<string, { stringValue?: string; integerValue?: string }>,
  updateFields?: string[],
) {
  const projectId =
    process.env.VITE_FIREBASE_PROJECT_ID ?? "demo-aizu-connect-e2e";
  const port = process.env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT ?? "8080";
  const updateMask = (updateFields ?? []).map(
    (field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`,
  );
  const query = updateMask.length > 0 ? `?${updateMask.join("&")}` : "";
  const response = await fetch(
    `http://127.0.0.1:${port}/v1/projects/${projectId}/databases/(default)/documents/${pathname}${query}`,
    {
      method: "PATCH",
      headers: {
        Authorization: "Bearer owner",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    },
  );
  if (!response.ok)
    throw new Error(`Firestore write failed: ${response.status}`);
}

async function deleteFirestoreDocument(pathname: string) {
  const projectId =
    process.env.VITE_FIREBASE_PROJECT_ID ?? "demo-aizu-connect-e2e";
  const port = process.env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT ?? "8080";
  const response = await fetch(
    `http://127.0.0.1:${port}/v1/projects/${projectId}/databases/(default)/documents/${pathname}`,
    { method: "DELETE", headers: { Authorization: "Bearer owner" } },
  );
  if (!response.ok)
    throw new Error(`Firestore delete failed: ${response.status}`);
}

async function confirmApplication(
  page,
  {
    waitlist = false,
    message = "E2Eから参加を希望します。",
  }: { waitlist?: boolean; message?: string } = {},
) {
  const title = waitlist ? "キャンセル待ちに登録" : "参加申請";
  await expect(page.getByRole("dialog", { name: title })).toBeVisible();
  await page.getByLabel("主催者へのメッセージ（任意）").fill(message);
  await page.getByRole("button", { name: "次へ" }).click();
  await page.getByRole("button", { name: "次へ" }).click();
  await page
    .getByRole("checkbox", {
      name: /イベント運営のため提供することに同意します/,
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
  test("student can enter the product and navigate core tabs", async ({
    page,
  }, testInfo) => {
    await installChatSendFailures(page);
    const suffix = projectSuffix(testInfo.project.name);
    await login(page, studentEmail(testInfo.project.name));
    const nav = page.getByRole("navigation", { name: "メインナビゲーション" });

    await expect(
      page.getByRole("heading", { name: "おすすめのイベント" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "E2E ページングイベント 01" }).first(),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("heading", { name: "おすすめのイベント" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "ログインする" }),
    ).toBeHidden();

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
      page.getByRole("heading", { name: "イベントを探す" }),
    ).toBeVisible();
    const filterTrigger = page.getByRole("button", { name: "絞り込み" });
    await expect(filterTrigger).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByLabel("曜日で絞り込む")).toBeHidden();
    await filterTrigger.click();
    await expect(filterTrigger).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByLabel("曜日で絞り込む")).toBeVisible();
    await filterTrigger.click();
    const searchInput = page.getByRole("textbox", { name: "イベントを検索" });
    await searchInput.click();
    await expect(searchInput).toBeFocused();
    await searchInput.fill("存在しない活動");
    await expect(
      page.getByRole("heading", {
        name: /読み込み済みの範囲に一致するイベントはありません|条件に合うイベントが見つかりません/,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "条件をリセット" }).click();
    await expect(searchInput).toHaveValue("");
    await searchInput.fill("E2E 地域交流会");

    await page
      .getByRole("button", { name: "E2E 地域交流会の詳細を見る" })
      .first()
      .click();
    await expect(
      page.getByRole("dialog", { name: "E2E 地域交流会" }),
    ).toBeVisible();
    await expect(page.getByText("このイベントでできること")).toBeVisible();
    await expect(page.getByText("地域の人とつながる")).toBeVisible();
    await expect(page.getByText("初参加歓迎").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "E2E 地域交流会" }),
    ).toBeHidden();
    await page.getByRole("button", { name: "ホームへ戻る" }).first().click();
    await expect(
      page.getByRole("heading", { name: "おすすめのイベント" }),
    ).toBeVisible();

    await nav.getByRole("button", { name: /^活動/ }).click();
    await expect(
      page.getByRole("heading", { name: "参加履歴", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "活動証明" }).click();
    await expect(page.getByText("証明済み活動")).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: `${new Date().getFullYear()}年`,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "参加履歴", exact: true }).click();
    await expect(page.locator(".certificate-id")).toContainText(
      `活動証明AC-app-e2e-${suffix}`,
    );
    await page.getByRole("button", { name: "参加予定" }).click();
    await expect(page.getByText("主催者確認中").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
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
    await verifyChatDraftRecovery(page, `学生 ${suffix}`, async () => {
      await nav.getByRole("button", { name: /^活動/ }).click();
      await nav.getByRole("button", { name: /^メッセージ/ }).click();
    });
    const studentMessage = `学生からの送信 ${suffix}`;
    await page
      .getByPlaceholder("全体チャットにメッセージを送る")
      .fill(studentMessage);
    await page.getByRole("button", { name: "メッセージを送信" }).click();
    await expect(
      page.locator(".chat-message p", { hasText: studentMessage }),
    ).toBeVisible();
    await expect(
      page.getByPlaceholder("全体チャットにメッセージを送る"),
    ).toHaveValue("");
    const attachmentName = `e2e-note-${projectSuffix(test.info().project.name)}.txt`;
    await page.locator(".chat-composer input[type=file]").setInputFiles({
      name: attachmentName,
      mimeType: "text/plain",
      buffer: Buffer.from("Aizu Connect attachment test"),
    });
    await expect(
      page.getByRole("link", { name: new RegExp(attachmentName) }),
    ).toBeVisible();
    const muteButton = page.getByRole("button", {
      name: "このチャットの通知をオフにする",
    });
    const unmuteButton = page.getByRole("button", {
      name: "このチャットの通知をオンにする",
    });
    await expect(
      page.getByRole("button", {
        name: /このチャットの通知を(オフ|オン)にする/,
      }),
    ).toBeVisible();
    if (await muteButton.isVisible()) {
      await muteButton.click();
      await expect(unmuteButton).toBeVisible();
    } else {
      await unmuteButton.click();
      await expect(muteButton).toBeVisible();
    }
    await expectNoHorizontalOverflow(page);

    await nav.getByRole("button", { name: "プロフィール" }).click();
    await expect(page.getByText("通知設定")).toBeVisible();
    await page
      .getByRole("button", {
        name: "ログアウト この端末からログアウト",
      })
      .click();
    await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
    await expect(page.getByLabel("メールアドレス")).toHaveValue("");
    await expect(page.getByLabel("パスワード", { exact: true })).toHaveValue(
      "",
    );
    await expect(
      page.getByText("ログインしました。活動を探しにいきましょう。"),
    ).toBeHidden();
  });

  test("login persistence survives reopening the site", async ({
    page,
  }, testInfo) => {
    await login(page, studentEmail(testInfo.project.name));
    const reopenedPage = await page.context().newPage();
    await page.close();
    await reopenedPage.goto("/");

    await expect(
      reopenedPage.getByRole("heading", { name: "おすすめのイベント" }),
    ).toBeVisible();
    await expect(
      reopenedPage.getByRole("button", { name: "ログインする" }),
    ).toBeHidden();
    await expectNoHorizontalOverflow(reopenedPage);
  });

  test("student can load events beyond the first search page", async ({
    page,
  }, testInfo) => {
    await login(page, studentEmail(testInfo.project.name));
    await openSearch(page);

    const pagingEvents = page.getByRole("button", {
      name: /E2E ページングイベント \d+の詳細を見る/,
    });
    await expect.poll(() => pagingEvents.count()).toBeGreaterThan(0);
    const initialEventCount = await pagingEvents.count();
    expect(initialEventCount).toBeLessThan(30);
    await page.getByRole("button", { name: "次の24件を見る" }).click();
    await expect
      .poll(() => pagingEvents.count())
      .toBeGreaterThan(initialEventCount);
    await expect(
      page.getByRole("button", {
        name: "E2E ページングイベント 30の詳細を見る",
      }),
    ).toBeVisible();
    const titles = (await page.locator(".event-card h3").allTextContents()).sort();
    await page.locator("summary").filter({ hasText: "表示方法" }).click();
    await page.getByRole("button", { name: "日付別表示", exact: true }).click();
    await expect(page.locator(".calendar-event-groups")).toBeVisible();
    await expect(
      page.locator(".calendar-event-groups > section > h3").first(),
    ).toHaveText(/\d{4}年\d{1,2}月\d{1,2}日\([日月火水木金土]\)/);
    await expect
      .poll(async () =>
        (await page.locator(".event-card h3").allTextContents()).sort(),
      )
      .toEqual(titles);
    await page.getByRole("button", { name: "一覧表示", exact: true }).click();
    await expect(page.locator(".calendar-event-groups")).toHaveCount(0);
    await expect
      .poll(async () =>
        (await page.locator(".event-card h3").allTextContents()).sort(),
      )
      .toEqual(titles);
    await expectNoHorizontalOverflow(page);
  });

  test("search automatically includes events beyond the first page", async ({
    page,
  }, testInfo) => {
    await login(page, studentEmail(testInfo.project.name));
    await openSearch(page);

    const laterEvent = page.getByRole("button", {
      name: "E2E ページングイベント 30の詳細を見る",
    });
    await expect(laterEvent).toHaveCount(0);
    await page
      .getByRole("textbox", { name: "イベントを検索" })
      .fill("E2E ページングイベント 30");
    await expect(laterEvent).toBeVisible();
    await expect(
      page.getByText("公開中のイベントをすべて確認しました"),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("student can submit a new application through functions", async ({
    page,
  }, testInfo) => {
    const eventTitle = `E2E 追加募集イベント ${projectVariant(testInfo.project.name)}`;
    await login(page, studentEmail(testInfo.project.name));

    await openSearch(page);
    await page
      .getByRole("textbox", { name: "イベントを検索" })
      .fill("追加募集");
    await page
      .getByRole("button", { name: `${eventTitle}の詳細を見る` })
      .click();
    await expect(page.getByRole("dialog", { name: eventTitle })).toBeVisible();

    await page.getByRole("button", { name: "このイベントに参加する" }).click();
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(1);
    await expect(page.getByRole("dialog", { name: eventTitle })).toBeHidden();
    await confirmApplication(page, {
      message: `${projectVariant(testInfo.project.name)}から参加します。`,
    });

    await expect(
      page.getByText("参加申請を送信しました。全体チャットを確認できます。"),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "メッセージ", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("strong").filter({ hasText: eventTitle }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "メッセージ履歴" }),
    ).toBeVisible();
  });

  test("student can check application status after a lost response", async ({ page }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);
    const eventId = `event-e2e-recovery-${suffix}`;
    const applicationId = `${eventId}_student-e2e-${suffix}`;
    const title = `E2E 通信確認イベント ${projectVariant(testInfo.project.name)}`;
    await deleteFirestoreDocument(`eventApplications/${applicationId}`);
    await deleteFirestoreDocument(`thirdPartyProvisionLogs/${applicationId}`);
    await writeFirestoreDocument(`events/${eventId}`, { applicantCount: { integerValue: "0" } }, ["applicantCount"]);
    await login(page, studentEmail(testInfo.project.name));
    await openSearch(page);
    await page.getByRole("textbox", { name: "イベントを検索" }).fill(title);
    await page.getByRole("button", { name: `${title}の詳細を見る` }).click();
    await page.getByRole("button", { name: "このイベントに参加する" }).click();
    // Drop the request before it reaches the server, then retry from the UI.
    await page.route("**/submitApplication", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await route.abort("failed");
    });
    await confirmApplication(page);
    await expect(page.getByText(/通信エラーのため、申込が完了したか確認できません/)).toBeVisible();
    const projectId = process.env.VITE_FIREBASE_PROJECT_ID ?? "demo-aizu-connect-e2e";
    const port = process.env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT ?? "8080";
    const missingApplication = await fetch(
      `http://127.0.0.1:${port}/v1/projects/${projectId}/databases/(default)/documents/eventApplications/${applicationId}`,
      { headers: { Authorization: "Bearer owner" } },
    );
    expect(missingApplication.status).toBe(404);
    expect((await readFirestoreDocument(`events/${eventId}`)).fields?.applicantCount?.integerValue).toBe("0");
    await page.unroute("**/submitApplication");
    await openSearch(page);
    await page.getByRole("textbox", { name: "イベントを検索" }).fill(title);
    await page.getByRole("button", { name: `${title}の詳細を見る` }).click();
    await page.getByRole("button", { name: "このイベントに参加する" }).click();
    // Forward the retry, then lose its response after the server has committed.
    await page.route("**/submitApplication", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const response = await route.fetch();
      expect(response.ok()).toBeTruthy();
      await route.abort("failed");
    });
    await confirmApplication(page);
    await expect(page.getByText(/通信エラーのため、申込が完了したか確認できません/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "参加履歴" })).toBeVisible();
    const application = page.locator(".application-item").filter({ hasText: title });
    await expect(application.getByText("主催者確認中", { exact: true })).toBeVisible();
    expect((await readFirestoreDocument(`eventApplications/${applicationId}`)).fields?.status?.stringValue).toBe("pending");
    expect((await readFirestoreDocument(`events/${eventId}`)).fields?.applicantCount?.integerValue).toBe("1");
    await page.unroute("**/submitApplication");
  });

  test("student can open the planning dashboard and submit an event plan", async ({
    page,
  }, testInfo) => {
    const eventTitle = `E2E 学生企画 ${testInfo.project.name}`;
    await login(page, studentEmail(testInfo.project.name));

    await page.getByRole("button", { name: "企画" }).click();
    await expect(
      page.getByRole("heading", { name: "イベント運営" }),
    ).toBeVisible();
    const managementNav = page.getByRole("navigation", {
      name: "企画管理メニュー",
    });
    await expect(
      managementNav.getByRole("button", { name: /^企画作成/ }),
    ).toBeVisible();
    await expect(
      managementNav.getByRole("button", { name: /^イベント/ }),
    ).toBeVisible();
    await expect(
      managementNav.getByRole("button", { name: /^参加者/ }),
    ).toBeVisible();
    await expect(
      managementNav.getByRole("button", { name: /^全体チャット/ }),
    ).toBeVisible();
    await managementNav.getByRole("button", { name: /^企画作成/ }).click();
    await expect(
      page.getByRole("heading", { name: "新しいイベント" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "勉強会" }).click();

    const titleField = page.getByLabel("活動名");
    const summaryField = page.getByLabel("活動の概要");
    const takeawaysField =
      page.getByLabel("イベントで体験できること（1行ずつ）");
    const eventFormProgress = page.getByRole("navigation", {
      name: "企画作成の手順",
    });
    await expect(
      eventFormProgress.getByRole("button", { name: /基本情報/ }),
    ).toBeVisible();
    await expect(
      eventFormProgress.getByRole("button", { name: /開催情報/ }),
    ).toBeVisible();
    await expect(
      eventFormProgress.getByRole("button", { name: /詳細・確認/ }),
    ).toBeVisible();
    await expect(page.getByLabel("過去の雰囲気・当日の空気感")).toHaveCount(0);
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
    await expect
      .poll(() =>
        titleField.evaluate((element) => element.matches(":placeholder-shown")),
      )
      .toBe(true);

    await titleField.fill(eventTitle);
    await summaryField.fill("学生が気軽に立ち上げる企画のE2E確認です。");
    await takeawaysField.fill(
      "新しいテーマを学ぶ\n小さな成果物を作る\n一緒に学ぶ仲間を見つける",
    );
    await expect
      .poll(() =>
        titleField.evaluate((element) => element.matches(":placeholder-shown")),
      )
      .toBe(false);
    await expect(page.getByLabel("初心者歓迎度")).toHaveValue("誰でも歓迎");
    await expect(
      page.getByText("JPEG・PNG・WebP / 20MB未満（保存時に自動圧縮）"),
    ).toBeVisible();
    const eventImageInput = page.getByRole("button", {
      name: "イベント写真",
      exact: true,
    });
    await eventImageInput.setInputFiles(fixtureImage);
    const cropDialog = page.getByRole("dialog", {
      name: "イベント写真の範囲を調整",
    });
    await expect(cropDialog).toBeVisible();
    await cropDialog.getByRole("button", { name: "選び直す" }).click();
    await expect(cropDialog).toBeHidden();
    const eventImagePreview = page.locator(
      ".event-form-card .event-image-preview img",
    );
    await expect(eventImagePreview).toHaveAttribute(
      "src",
      /event-learning\.svg(?:\?no-inline)?$/,
    );

    await eventImageInput.setInputFiles(fixtureImage);
    await expect(cropDialog).toBeVisible();
    await cropDialog.getByRole("button", { name: "画像を拡大" }).click();
    await expect(cropDialog.getByLabel("画像の拡大率")).toHaveValue("1.1");
    await cropDialog.getByRole("button", { name: "中央に戻す" }).click();
    await expect(cropDialog.getByLabel("画像の拡大率")).toHaveValue("1");
    await cropDialog.getByLabel("画像の拡大率").fill("1.2");
    await cropDialog.getByRole("button", { name: "この範囲を使う" }).click();
    await expect(cropDialog).toBeHidden();
    await page.getByRole("button", { name: "元の写真から再調整" }).click();
    await expect(cropDialog).toBeVisible();
    await cropDialog.getByLabel("画像の拡大率").fill("1.1");
    await cropDialog.getByRole("button", { name: "この範囲を使う" }).click();
    await expect(cropDialog).toBeHidden();
    await eventFormProgress
      .getByRole("button", { name: /開催情報/ })
      .click();
    await expect(page.getByLabel("開始日時")).toBeVisible();
    await expect(page.getByLabel("アクセス方法")).toBeHidden();
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    nextWeek.setHours(18, 0, 0, 0);
    await page.getByLabel("開始日時").fill(nextWeek.toISOString().slice(0, 16));
    await eventFormProgress
      .getByRole("button", { name: /詳細・確認/ })
      .click();
    await expect(page.getByLabel("アクセス方法")).toBeVisible();
    const preview = page.getByRole("dialog", { name: eventTitle });
    await page
      .getByRole("button", { name: "公開前プレビュー", exact: true })
      .click();
    await expect(preview).toBeVisible();
    await expect(preview).toContainText(
      "学生が気軽に立ち上げる企画のE2E確認です。",
    );
    await expect(preview).toContainText("一緒に学ぶ仲間を見つける");
    await preview.getByRole("button", { name: "プレビューを閉じる" }).click();
    await expect(preview).toBeHidden();
    await expect(page.getByLabel("開始日時")).toHaveValue(
      nextWeek.toISOString().slice(0, 16),
    );
    await eventFormProgress.getByRole("button", { name: /基本情報/ }).click();
    const updatedSummary = "プレビューを閉じて更新した企画の概要です。";
    await summaryField.fill(updatedSummary);
    await eventFormProgress.getByRole("button", { name: /詳細・確認/ }).click();
    await page
      .getByRole("button", { name: "公開前プレビュー", exact: true })
      .click();
    await expect(preview).toContainText(updatedSummary);
    await preview.getByRole("button", { name: "プレビューを閉じる" }).click();
    await expect(summaryField).toHaveValue(updatedSummary);
    await page.getByRole("button", { name: "企画を申請する" }).click();

    await expect(page.getByText("活動を審査へ申請しました。")).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: new RegExp(`^${escapeRegExp(eventTitle)}\\s`),
      }),
    ).toBeVisible();

    const submittedEvent = page
      .locator(".managed-event-row")
      .filter({ hasText: eventTitle });
    await expect(submittedEvent.getByText("審査中")).toBeVisible();
    await submittedEvent.getByRole("button", { name: new RegExp(`^${escapeRegExp(eventTitle)}\\s`) }).click();
    await page.locator(".event-survey-results > summary").click();
    await expect(page.getByRole("region", { name: "開催後アンケートの回答" }).getByText("まだ回答はありません。")).toBeVisible();
    await page.getByRole("button", { name: /団体ホーム/ }).click();
    await page.getByRole("button", { name: /^イベント/ }).click();
    await submittedEvent.getByRole("button", { name: "複製" }).click();
    await expect(page.getByLabel("活動名")).toHaveValue(
      `${eventTitle}（複製）`,
    );
    await expect(page.getByLabel("開始日時")).toHaveValue("");
    await expect(eventImagePreview).toHaveAttribute(
      "src",
      /event-learning\.svg(?:\?no-inline)?$/,
    );
    await page.getByRole("button", { name: /団体ホーム/ }).click();
    await page.getByRole("button", { name: /^イベント/ }).click();
    await submittedEvent.getByRole("button", { name: "編集" }).click();
    await expect(
      page.getByRole("heading", { name: "イベントを編集", level: 1 }),
    ).toBeVisible();
    const updatedTitle = `${eventTitle} 修正版`;
    await page.getByLabel("活動名").fill(updatedTitle);
    await eventFormProgress
      .getByRole("button", { name: /開催情報/ })
      .click();
    await eventFormProgress
      .getByRole("button", { name: /詳細・確認/ })
      .click();
    await page.getByRole("button", { name: "変更を審査へ送る" }).click();
    await expect(
      page.getByText("活動を修正して再申請しました。"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: new RegExp(`^${escapeRegExp(updatedTitle)}\\s`),
      }),
    ).toBeVisible();
  });

  test("student can crop and save a profile image", async ({
    page,
  }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);
    await login(page, `student-late-${suffix}@u-aizu.ac.jp`);

    await page
      .getByRole("navigation", { name: "メインナビゲーション" })
      .getByRole("button", { name: "プロフィール" })
      .click();
    await page.locator(".profile-edit-button").click();
    await expect(
      page.getByText("JPEG・PNG・WebP / 20MB未満（保存時に自動圧縮）"),
    ).toBeVisible();
    const imageInput = page.getByRole("button", {
      name: "プロフィール画像",
      exact: true,
    });
    const cropDialog = page.getByRole("dialog", {
      name: "プロフィール画像の範囲を調整",
    });
    let releaseCropper: () => void = () => {};
    const cropperReady = new Promise<void>((resolve) => {
      releaseCropper = resolve;
    });
    await page.route(
      /\/src\/components\/ImageCropper\.tsx(?:\?.*)?$/,
      async (route) => {
        await cropperReady;
        await route.continue();
      },
    );
    try {
      await imageInput.setInputFiles(fixtureImage);
      await expect(
        cropDialog.getByText("画像編集を読み込んでいます。", { exact: true }),
      ).toBeVisible();
      await expect(
        cropDialog.getByRole("button", { name: "画像の切り抜きを閉じる" }),
      ).toBeFocused();
      await expect(
        cropDialog.getByRole("button", { name: "この範囲を使う" }),
      ).toBeDisabled();
      await page.keyboard.press("Escape");
      await expect(cropDialog).toBeHidden();
    } finally {
      releaseCropper();
      await page.unrouteAll({ behavior: "wait" });
    }
    await imageInput.setInputFiles(fixtureImage);
    await expect(cropDialog).toBeVisible();
    await expect(
      cropDialog.getByText("ドラッグで移動", { exact: true }),
    ).toBeVisible();
    await cropDialog.getByRole("button", { name: "画像を拡大" }).click();
    await cropDialog.getByRole("button", { name: "画像を縮小" }).click();
    await cropDialog.getByLabel("画像の拡大率").fill("1.3");
    await cropDialog.getByRole("button", { name: "この範囲を使う" }).click();
    await expect(cropDialog).toBeHidden();
    await page.getByRole("button", { name: "元の写真から再調整" }).click();
    await expect(cropDialog).toBeVisible();
    await cropDialog.getByRole("button", { name: "この範囲を使う" }).click();
    await expect(cropDialog).toBeHidden();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "保存", exact: true })
      .click();
    await expect(page.getByText("プロフィールを更新しました。")).toBeVisible();
    await expect(page.locator(".profile-avatar img")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("application joins the event-wide chat with history", async ({
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
      page.getByRole("heading", { name: "メッセージ", exact: true }),
    ).toBeVisible();
    const activeConversation = page.getByRole("button", {
      name: "チャット一覧へ戻る",
    });
    if (!(await activeConversation.isVisible())) {
      const eventRoom = page.getByRole("button", {
        name: new RegExp(`${eventTitle}.*全体`),
      });
      await expect(eventRoom).toBeVisible();
      await eventRoom.click();
    }
    await expect(
      page.locator("p", { hasText: "履歴メッセージ 120" }),
    ).toBeVisible();
    await expect(
      page.locator("p", { hasText: "履歴メッセージ 001" }),
    ).toBeHidden();
    await page
      .getByRole("button", { name: "過去のメッセージを読み込む" })
      .click();
    await expect(
      page.locator("p", { hasText: "履歴メッセージ 001" }),
    ).toBeVisible();
    if (await activeConversation.isVisible()) {
      await activeConversation.click();
    }
    await expect(
      page.getByRole("button", {
        name: new RegExp(`E2E主催団体 ${eventTitle}`),
      }),
    ).toBeVisible();
    await expect(page.getByText("個別チャット", { exact: true })).toHaveCount(
      0,
    );
  });

  test("full events use the waitlist instead of blocking applications", async ({
    page,
  }, testInfo) => {
    const eventTitle = `E2E 満員イベント ${projectVariant(testInfo.project.name)}`;
    await login(page, studentEmail(testInfo.project.name));

    await openSearch(page);
    await page
      .getByRole("textbox", { name: "イベントを検索" })
      .fill(eventTitle);
    await page
      .getByRole("button", { name: `${eventTitle}の詳細を見る` })
      .click();
    await page
      .getByRole("button", { name: "キャンセル待ちに登録する" })
      .click();
    await confirmApplication(page, { waitlist: true });

    await expect(
      page.getByText("キャンセル待ちに登録しました。空きが出たら通知します。"),
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
    testInfo.setTimeout(45_000);
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
    await occupiedApplication
      .getByRole("button", { name: "キャンセル" })
      .click();
    const cancellationDialog = page.getByRole("alertdialog", {
      name: "参加申請をキャンセルしますか？",
    });
    const cancellationReason = cancellationDialog.getByLabel("キャンセル理由");
    const cancellationReasonText = "E2E端末別テストのためキャンセルします。";
    await expect(async () => {
      await cancellationReason.fill(cancellationReasonText);
      await expect(cancellationReason).toHaveValue(cancellationReasonText);
    }).toPass({ timeout: 10_000 });
    const confirmCancellation = cancellationDialog.getByRole("button", {
      name: "申請を取り消す",
    });
    await expect(confirmCancellation).toBeEnabled();
    await confirmCancellation.click();
    await expect(
      page.getByText("参加申請をキャンセルしました。"),
    ).toBeVisible();

    await nav.getByRole("button", { name: "プロフィール" }).click();
    await page
      .getByRole("button", {
        name: "ログアウト この端末からログアウト",
      })
      .click();
    await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
    await login(page, studentEmail(testInfo.project.name));
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

  test("student keeps check-in and survey drafts while switching activity views", async ({
    page,
  }, testInfo) => {
    const variant = projectVariant(testInfo.project.name);
    const checkInTitle = `E2E QR受付確認 ${variant}`;
    const surveyTitle = `E2E 開催後アンケート ${variant}`;
    await login(page, studentEmail(testInfo.project.name));
    await page
      .getByRole("navigation", { name: "メインナビゲーション" })
      .getByRole("button", { name: /^活動/ })
      .click();
    const checkIn = page.getByLabel(`${checkInTitle}の受付コード`);
    const comment = page.getByLabel(`${surveyTitle}の感想`);
    const rating = page.getByLabel(`${surveyTitle}の満足度`);
    await checkIn.fill("246810");
    await comment.fill("活動画面を切り替えても感想の下書きを保持します。");
    await rating.selectOption("4");
    const views = page.getByRole("navigation", {
      name: "参加履歴の表示切り替え",
    });
    await views.getByRole("button", { name: "参加履歴", exact: true }).click();
    await views.getByRole("button", { name: "活動証明", exact: true }).click();
    await views.getByRole("button", { name: "参加予定", exact: true }).click();
    await expect(checkIn).toHaveValue("246810");
    await expect(comment).toHaveValue(
      "活動画面を切り替えても感想の下書きを保持します。",
    );
    await expect(rating).toHaveValue("4");
    await expectNoHorizontalOverflow(page);
  });

  test("survey submissions recover from failures and organizers can read all results", async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(60_000);
    const suffix = projectSuffix(testInfo.project.name);
    const title = `E2E 開催後アンケート ${projectVariant(testInfo.project.name)}`;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await installEngagementFailures(page);
    await login(page, studentEmail(testInfo.project.name));
    const nav = page.getByRole("navigation", { name: "メインナビゲーション" });
    await nav.getByRole("button", { name: /^活動/ }).click();
    const item = page.locator(".application-item").filter({ hasText: title });
    const comment = `送信失敗から復元した感想 ${suffix}`;
    await item.getByLabel(`${title}の満足度`).selectOption("4");
    await item.getByLabel(`${title}の感想`).fill(comment);
    await failEngagementOperation(page, "saveEventSurvey", "deferred");
    await item
      .getByRole("button", { name: "アンケートを送信", exact: true })
      .click();
    await expect(
      item.getByRole("button", { name: "送信中…", exact: true }),
    ).toBeDisabled();
    await expect(item.getByLabel(`${title}の感想`)).toBeDisabled();
    await item
      .getByRole("button", { name: "送信中…", exact: true })
      .evaluate((button) =>
        button.dispatchEvent(new MouseEvent("click", { bubbles: true })),
      );
    expect(
      await page.evaluate(() => window.engagementCalls?.saveEventSurvey),
    ).toBe(1);
    await rejectEngagementOperation(page);
    await expect(item.getByRole("alert")).toContainText(
      "検証用のsaveEventSurvey失敗",
    );
    await expect(item.getByLabel(`${title}の感想`)).toHaveValue(comment);
    await item
      .getByRole("button", { name: "アンケートを送信", exact: true })
      .click();
    await expect(item.getByText("アンケートを送信しました。")).toBeVisible();
    await expect(
      item.getByRole("button", { name: "回答済み", exact: true }),
    ).toBeDisabled();
    const saved = await readFirestoreDocument(
      `eventSurveys/event-e2e-a11y-survey-${suffix}/responses/student-e2e-${suffix}`,
    );
    expect(saved.fields?.rating?.integerValue).toBe("4");
    expect(saved.fields?.userId?.stringValue).toBe(`student-e2e-${suffix}`);
    await nav.getByRole("button", { name: "プロフィール" }).click();
    await page
      .getByRole("button", { name: "ログアウト この端末からログアウト" })
      .click();
    await login(page, organizationEmail(testInfo.project.name));
    await page.getByRole("button", { name: /^イベント/ }).click();
    await page
      .locator(".managed-event-row")
      .filter({ hasText: title })
      .getByRole("button", { name: new RegExp(`^${escapeRegExp(title)}\\s`) })
      .click();
    await failEngagementOperation(page, "loadEventSurveySummary", "immediate");
    await page.locator(".event-survey-results > summary").click();
    const panel = page.getByRole("region", { name: "開催後アンケートの回答" });
    await expect(panel.getByRole("alert")).toContainText(
      "アンケートを取得できませんでした",
    );
    await clearEngagementFailure(page);
    await panel.getByRole("button", { name: "回答を再読み込み" }).click();
    await expect(panel.locator(".event-survey-summary")).toContainText("52件");
    await expect(panel.locator(".event-survey-summary")).toContainText("3.0 / 5");
    await expect(panel.locator(".event-survey-summary")).toContainText("2%");
    await expect(panel.getByText(comment, { exact: true })).toBeVisible();
    await expect(panel.locator(".event-survey-response-list > li")).toHaveCount(
      50,
    );
    await panel.getByRole("button", { name: "回答をさらに50件読み込む" }).click();
    await expect(panel.locator(".event-survey-response-list > li")).toHaveCount(
      52,
    );
    await expect(
      panel.getByText("追加ページのアンケート回答", { exact: true }),
    ).toBeVisible();
    await expect(panel).not.toContainText(`student-e2e-${suffix}`);
    await expectNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
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

  test("suspended student cannot check in with a valid code", async ({
    page,
  }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);
    const studentId = `student-suspended-checkin-${suffix}`;
    const eventId = `event-suspended-checkin-${suffix}`;
    await login(page, `${studentId}@u-aizu.ac.jp`);

    const response = await callEmulatedFunction(page, "checkInToEvent", {
      eventId,
      code: "112233",
    });
    expect(response.ok).toBe(false);
    expect(response.body.error?.status).toBe("PERMISSION_DENIED");
    const application = await readFirestoreDocument(
      `eventApplications/${eventId}_${studentId}`,
    );
    expect(application.fields?.status?.stringValue).toBe("confirmed");
  });

  test("deleting a chat message removes its readable edit history", async ({
    page,
  }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);
    const studentId = `student-message-delete-${suffix}`;
    const roomId = `message-delete-${suffix}`;
    await login(page, `${studentId}@u-aizu.ac.jp`);

    const response = await callEmulatedFunction(page, "manageChatMessage", {
      roomId,
      messageId: "delete-target",
      action: "delete",
    });
    expect(response).toMatchObject({
      ok: true,
      body: { result: { status: "deleted" } },
    });
    const message = await readFirestoreDocument(
      `chatRooms/${roomId}/messages/delete-target`,
    );
    expect(message.fields?.text?.stringValue).toBe(
      "このメッセージは削除されました。",
    );
    expect(message.fields?.editHistory).toBeUndefined();
    expect(message.fields?.editedAt).toBeUndefined();
  });

  test("event chat provisioning preserves an existing room on trigger retry", async ({
    page: _page,
  }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);
    const eventId = `event-trigger-idempotency-${suffix}`;
    const roomId = `event_${eventId}`;
    const eventFields = {
      title: { stringValue: `E2E トリガー再実行 ${suffix}` },
      organizationName: { stringValue: "E2E主催団体" },
      createdBy: { stringValue: `org-e2e-${suffix}` },
    };
    await writeFirestoreDocument(`events/${eventId}`, eventFields);
    await expect
      .poll(async () => {
        try {
          const room = await readFirestoreDocument(`chatRooms/${roomId}`);
          return room.fields?.status?.stringValue;
        } catch {
          return undefined;
        }
      })
      .toBe("active");
    await writeFirestoreDocument(
      `chatRooms/${roomId}`,
      {
        lastMessageText: { stringValue: "既存会話を保持" },
        memberCount: { integerValue: "7" },
      },
      ["lastMessageText", "memberCount"],
    );

    await deleteFirestoreDocument(`events/${eventId}`);
    await writeFirestoreDocument(`events/${eventId}`, eventFields);
    await expect
      .poll(async () => {
        const room = await readFirestoreDocument(`chatRooms/${roomId}`);
        return {
          lastMessageText: room.fields?.lastMessageText?.stringValue,
          memberCount: room.fields?.memberCount?.integerValue,
        };
      })
      .toEqual({ lastMessageText: "既存会話を保持", memberCount: "7" });
  });

  test("student can manage notifications, saved events, profile, calendar, and reports", async ({
    page,
  }, testInfo) => {
    const variant = projectVariant(testInfo.project.name);
    const suffix = projectSuffix(testInfo.project.name);
    const eventTitle = `E2E 追加募集イベント ${variant}`;
    await login(page, `student-profile-${suffix}@u-aizu.ac.jp`);

    await page.getByTitle("通知").click();
    const notificationPanel = page.getByRole("complementary", {
      name: "通知",
    });
    await expect(notificationPanel).toBeVisible();
    await notificationPanel
      .getByRole("button", { name: "すべて既読" })
      .click();
    await expect(notificationPanel.getByText("すべて確認済み")).toBeVisible();
    await notificationPanel
      .getByRole("button", { name: /E2E 通知 E2E通知本文/ })
      .click();
    await expect(page.getByRole("dialog", { name: eventTitle })).toBeVisible();
    await page.keyboard.press("Escape");

    await openSearch(page);
    await page
      .getByRole("textbox", { name: "イベントを検索" })
      .fill(eventTitle);
    const saveEventButton = page.getByRole("button", {
      name: new RegExp(`^${escapeRegExp(eventTitle)}を(?:保存|保存から削除)$`),
    });
    if ((await saveEventButton.getAttribute("aria-pressed")) !== "true") {
      await saveEventButton.click();
    }
    await page
      .locator("summary")
      .filter({ hasText: "検索条件を保存" })
      .click();
    await page.getByRole("button", { name: "この条件を保存" }).click();
    await expect(
      page.getByText(
        "検索条件を保存しました。条件に合う新着イベントを通知します。",
      ),
    ).toBeVisible();

    await page
      .getByRole("navigation", { name: "メインナビゲーション" })
      .getByRole("button", { name: "プロフィール" })
      .click();
    const savedEvent = page
      .locator(".saved-event-list")
      .getByRole("button", { name: new RegExp(eventTitle) });
    await expect(savedEvent).toBeVisible();

    await page.getByRole("button", { name: /通知設定/ }).click();
    const newEventPreference = page.getByLabel("新着イベント");
    await newEventPreference.scrollIntoViewIfNeeded();
    await expect(newEventPreference).toBeEnabled();
    if (await newEventPreference.isChecked()) {
      await newEventPreference.uncheck();
    }
    await expect(newEventPreference).not.toBeChecked();

    await page.getByRole("button", { name: "編集" }).click();
    await page
      .getByLabel("今やっていること（任意）")
      .fill("E2Eプロフィール更新済み");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "保存", exact: true })
      .click();
    await expect(page.getByText("プロフィールを更新しました。")).toBeVisible();
    await expect(page.getByText("E2Eプロフィール更新済み")).toBeVisible();

    await page
      .getByRole("button", { name: /利用規約 サービスの利用条件を確認する/ })
      .click();
    await expect(page.getByRole("dialog", { name: "利用規約" })).toBeVisible();
    await page.keyboard.press("Escape");

    await savedEvent.click();
    await expect(page.getByRole("dialog", { name: eventTitle })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Googleカレンダー/ }),
    ).toHaveAttribute(
      "href",
      /https:\/\/calendar\.google\.com\/calendar\/render\?/,
    );
    const calendarDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Appleカレンダー" }).click();
    const calendarDownload = await calendarDownloadPromise;
    expect(
      normalizeBrowserDownloadFilename(calendarDownload.suggestedFilename()),
    ).toBe(normalizeBrowserDownloadFilename(`${eventTitle}.ics`));
    await page.getByRole("button", { name: "掲載を通報" }).click();
    const reportDialog = page.getByRole("dialog", { name: "通報する" });
    await reportDialog
      .getByLabel("詳細（任意）")
      .fill(`${variant}の通報完了動線を確認します。`);
    await reportDialog.getByRole("button", { name: "通報を送信" }).click();
    await expect(
      page.getByText("通報を受け付けました。運営が確認します。"),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("student can view a certificate and manage an account deletion request", async ({
    page,
  }, testInfo) => {
    const variant = projectVariant(testInfo.project.name);
    const suffix = projectSuffix(testInfo.project.name);
    await login(page, `student-account-${suffix}@u-aizu.ac.jp`);
    await page
      .getByRole("navigation", { name: "メインナビゲーション" })
      .getByRole("button", { name: /^活動/ })
      .click();
    await page.getByRole("button", { name: "活動証明" }).click();
    await expect(page.getByText("証明済み活動")).toBeVisible();
    await page.getByRole("button", { name: "参加履歴", exact: true }).click();
    await page.getByRole("button", { name: "証明書を表示・共有" }).click();
    const certificate = page.getByRole("dialog", { name: "活動証明書" });
    await expect(certificate).toBeVisible();
    await expect(certificate.getByText(`AC-account-${suffix}`)).toBeVisible();
    await page.keyboard.press("Escape");
    await page
      .getByRole("navigation", { name: "メインナビゲーション" })
      .getByRole("button", { name: "プロフィール" })
      .click();
    await page.getByRole("button", { name: "退会を申請する" }).click();
    const deletionDialog = page.getByRole("alertdialog", {
      name: "退会・データ削除を申請",
    });
    await deletionDialog
      .getByLabel("退会理由・削除に関する連絡")
      .fill(`${variant}でアプリ内退会申請を確認します。`);
    await deletionDialog
      .getByRole("button", { name: "削除を申請する" })
      .click();
    await expect(page.getByText("退会・データ削除を申請中")).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "申請を取り消す" }).click();
    await page
      .getByRole("alertdialog", { name: "退会申請を取り消しますか？" })
      .getByRole("button", { name: "申請を取り消す" })
      .click();
    await expect(page.getByText("退会申請を取り消しました。")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "退会を申請する" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("organization can view its dashboard, applicants, and messages", async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(45_000);
    await installChatSendFailures(page);
    const variant = projectVariant(testInfo.project.name);
    const eventChatTitle = `E2E 全体チャットイベント ${variant}`;
    const dashboardEventTitle = `E2E 地域交流会 ${variant}`;
    await login(page, organizationEmail(testInfo.project.name));

    await page
      .getByRole("button", { name: "ダッシュボードのホームへ戻る" })
      .click();
    await page.getByRole("button", { name: /^イベント/ }).click();
    await expect(
      page.getByRole("heading", { name: "登録したイベント" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: new RegExp(`${escapeRegExp(dashboardEventTitle)} .* 公開中`),
      }),
    ).toBeVisible();

    await page
      .getByRole("button", {
        name: new RegExp(`${escapeRegExp(dashboardEventTitle)} .* 公開中`),
      })
      .click();
    await expect(
      page.getByRole("heading", { name: "参加者一覧" }),
    ).toBeVisible();
    const dashboardApplicant = page
      .locator(".applicant-row")
      .filter({ hasText: "E2E 学生" });
    await expect(dashboardApplicant).toBeVisible();
    await expect(
      page.getByRole("button", { name: "承認", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "見送り" }).click();
    await expect(
      page.getByRole("alertdialog", { name: "参加申請を見送りますか？" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toBeHidden();
    await page.getByRole("button", { name: /団体ホーム/ }).click();
    await page.getByRole("button", { name: /^全体チャット/ }).click();
    const mobileChatBack = page.getByRole("button", {
      name: "チャット一覧へ戻る",
    });
    if (await mobileChatBack.isVisible()) await mobileChatBack.click();
    await page
      .getByRole("button", {
        name: new RegExp(`参加者全員 ${eventChatTitle}`),
      })
      .click();
    await expect(
      page.locator(".chat-panel-title").getByText(eventChatTitle),
    ).toBeVisible();
    await expect(
      page.getByPlaceholder("全体チャットにメッセージを送る"),
    ).toBeVisible();
    await verifyChatDraftRecovery(
      page,
      `主催者 ${projectSuffix(testInfo.project.name)}`,
      async () => {
        await page.getByRole("button", { name: /団体ホーム/ }).click();
        await page.getByRole("button", { name: /^全体チャット/ }).click();
      },
    );
    const organizationMessage = `主催者からの送信 ${projectSuffix(testInfo.project.name)}`;
    await page
      .getByPlaceholder("全体チャットにメッセージを送る")
      .fill(organizationMessage);
    await page.getByRole("button", { name: "メッセージを送信" }).click();
    await expect(
      page.locator(".chat-message p", { hasText: organizationMessage }),
    ).toBeVisible();
    const attachmentName = `organizer-note-${projectSuffix(testInfo.project.name)}.txt`;
    await page.locator(".chat-composer input[type=file]").setInputFiles({
      name: attachmentName,
      mimeType: "text/plain",
      buffer: Buffer.from("Organizer attachment test"),
    });
    await expect(
      page.getByRole("link", { name: new RegExp(attachmentName) }),
    ).toBeVisible();
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

  test("organization can complete participant management and reporting flows", async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(60_000);
    const variant = projectVariant(testInfo.project.name);
    const eventTitle = `E2E 参加者管理 ${variant}`;
    const studentName = `E2E 後参加 ${variant}`;
    await login(page, organizationEmail(testInfo.project.name));
    await page.getByRole("button", { name: /^イベント/ }).click();

    const managedEvent = page
      .locator(".managed-event-row")
      .filter({ hasText: eventTitle });
    await managedEvent
      .getByRole("button", {
        name: new RegExp(`^${escapeRegExp(eventTitle)}\\s`),
      })
      .click();
    const qrCode = page.locator(".check-in-qr");
    await expect(qrCode).toBeVisible();
    await expect(qrCode).toHaveAttribute("src", /^data:image\/png;base64,/);
    await expect
      .poll(() =>
        qrCode.evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBe(280);
    const applicant = page
      .locator(".applicant-row")
      .filter({ hasText: studentName });
    await expect(applicant).toBeVisible();
    const organizerNote = applicant.getByLabel(`${studentName}さんの運営メモ`);
    const expectedOrganizerNote = `${variant}の運営メモ-${testInfo.retry}`;
    if ((await organizerNote.inputValue()) !== expectedOrganizerNote) {
      await organizerNote.fill(expectedOrganizerNote);
      await organizerNote.press("Tab");
      await expect(
        page.getByText(`${studentName}さんの運営メモを保存しました。`),
      ).toBeVisible();
    } else {
      await expect(organizerNote).toHaveValue(expectedOrganizerNote);
    }

    const pendingStatus = applicant.getByText("主催者確認中");
    if (await pendingStatus.isVisible()) {
      await applicant.getByLabel(`${studentName}さんを選択`).check();
      await page.getByRole("button", { name: "選択を承認" }).click();
      await expect(page.getByText("1名を参加確定にしました。")).toBeVisible();
      await expect(applicant).toContainText("参加確定");
    }

    const confirmedStatus = applicant.getByText("参加確定");
    if (await confirmedStatus.isVisible()) {
      await applicant.getByLabel(`${studentName}さんを選択`).check();
      await page.getByRole("button", { name: "選択を出席" }).click();
      await expect(
        page.getByText("1名を出席として記録しました。"),
      ).toBeVisible();
    }
    await expect(applicant).toContainText("活動実績済み");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "レポート出力" }).click();
    const download = await downloadPromise;
    expect(normalizeBrowserDownloadFilename(download.suggestedFilename())).toBe(
      normalizeBrowserDownloadFilename(`${eventTitle}-参加者レポート.csv`),
    );
    await expect(
      page.getByText("参加者レポートを出力しました。"),
    ).toBeVisible();

    await page.getByRole("button", { name: /団体ホーム/ }).click();
    await page.getByRole("button", { name: /^全体チャット/ }).click();
    const message = `${variant}の参加者管理連絡です。`;
    const sentMessage = page.locator("p", { hasText: message });
    if ((await sentMessage.count()) === 0) {
      await page
        .getByPlaceholder("全体チャットにメッセージを送る")
        .fill(message);
      await page.getByTitle("送信").click();
    }
    await expect(sentMessage.first()).toBeVisible();
    await page.getByRole("button", { name: /団体ホーム/ }).click();
    await page.getByRole("button", { name: /^イベント/ }).click();

    const cancelButton = managedEvent.getByRole("button", {
      name: "中止",
      exact: true,
    });
    if (await cancelButton.isVisible()) {
      await cancelButton.click();
      const cancellationDialog = page.getByRole("alertdialog", {
        name: "イベントを中止",
      });
      await cancellationDialog
        .getByLabel("中止理由")
        .fill(`${variant}の中止動線確認です。`);
      await cancellationDialog
        .getByRole("button", { name: "イベントを中止する" })
        .click();
      await expect(
        page.getByText("イベントを中止し、参加者への通知処理を開始しました。"),
      ).toBeVisible();
    }
    await expect(managedEvent.getByText("中止", { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("admin can load reports beyond the first review page", async ({
    page,
  }, testInfo) => {
    await login(page, adminEmail(testInfo.project.name), "admin123");

    const reportQueue = page.locator(".admin-report-card");
    await expect(reportQueue.getByText("E2E ページング通報 55")).toHaveCount(0);
    await reportQueue.getByRole("button", { name: "さらに50件" }).click();
    await expect(reportQueue.getByText("E2E ページング通報 55")).toBeVisible();
    await expect(reportQueue.getByText("全件表示")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("admin assignments restore saved values and recover from read and save failures", async ({
    page,
  }, testInfo) => {
    const suffix = projectSuffix(testInfo.project.name);
    const eventId = `admin-review-event-${suffix}`;
    const title = `E2E 管理審査イベント ${projectVariant(testInfo.project.name)}`;
    await installEngagementFailures(page);
    await page.addInitScript((targetId) => {
      if (!sessionStorage.getItem("e2e-assignment-read-failed")) {
        sessionStorage.setItem("e2e-assignment-read-failed", "1");
        window.engagementFailure = {
          operation: "loadAdminAssignment",
          mode: "immediate",
          targetId,
          repeat: true,
        };
      }
    }, eventId);
    await login(page, adminEmail(testInfo.project.name), "admin123");
    const control = page
      .locator(".admin-review-item")
      .filter({ hasText: title })
      .locator(".admin-assignment-controls");
    await expect(control.getByRole("alert")).toContainText(
      "検証用のloadAdminAssignment失敗",
    );
    await clearEngagementFailure(page);
    await control.getByRole("button", { name: "担当情報を再読み込み" }).click();
    await expect(control.getByLabel("対応状況")).toBeEnabled();
    await control.getByLabel("対応状況").selectOption("in_progress");
    await control.getByLabel("対応期限").fill("2030-11-01");
    await failEngagementOperation(page, "saveAdminAssignment", "deferred");
    await control
      .getByRole("button", { name: "自分が担当", exact: true })
      .click();
    await expect(
      control.getByRole("button", { name: "保存中…", exact: true }),
    ).toBeDisabled();
    await rejectEngagementOperation(page);
    await expect(control.getByRole("alert")).toContainText(
      "検証用のsaveAdminAssignment失敗",
    );
    await expect(control.getByLabel("対応期限")).toHaveValue("2030-11-01");
    await control
      .getByRole("button", { name: "自分が担当", exact: true })
      .click();
    await expect(control.getByRole("status")).toHaveText(
      "担当情報を保存しました。",
    );
    await page.reload();
    await expect(control.getByLabel("対応状況")).toHaveValue("in_progress");
    await expect(control.getByLabel("対応期限")).toHaveValue("2030-11-01");
    await control.getByLabel("対応状況").selectOption("completed");
    await control.getByLabel("対応期限").fill("");
    await control.getByRole("button", { name: "担当内容を保存" }).click();
    await expect(control.getByRole("status")).toHaveText(
      "担当情報を保存しました。",
    );
    await page.reload();
    await expect(control.getByLabel("対応状況")).toHaveValue("completed");
    await expect(control.getByLabel("対応期限")).toHaveValue("");
    const saved = await readFirestoreDocument(
      `adminAssignments/event_${eventId}`,
    );
    expect(saved.fields?.status?.stringValue).toBe("completed");
    expect(saved.fields?.dueAt).toBeUndefined();
    await expectNoHorizontalOverflow(page);
  });

  test("admin can inspect and complete review operations", async ({
    page,
  }, testInfo) => {
    const variant = projectVariant(testInfo.project.name);
    await login(page, adminEmail(testInfo.project.name), "admin123");

    await expect(
      page.getByRole("heading", { name: "イベント審査" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "利用状況" })).toBeVisible();
    await expect(page.getByText("登録ユーザー", { exact: true })).toBeVisible();
    await expect(page.getByText("申込完了率", { exact: true })).toBeVisible();
    await expect(
      page.getByText("直近7日の画面エラー", { exact: true }),
    ).toBeVisible();
    const adminSearch = page.getByLabel("管理対象を検索");
    await adminSearch.fill("E2E");
    await page
      .getByRole("button", { name: "ダッシュボードのホームへ戻る" })
      .click();
    await expect(adminSearch).toHaveValue("");
    const managedUserScrollRegion = page.getByRole("region", {
      name: "ユーザー管理一覧",
    });
    await expect(managedUserScrollRegion).toBeVisible();
    const managedUserScrollState = await managedUserScrollRegion.evaluate(
      (element) => ({
        itemCount: element.children.length,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        overflowY: window.getComputedStyle(element).overflowY,
      }),
    );
    expect(managedUserScrollState.itemCount).toBeGreaterThan(10);
    expect(managedUserScrollState.scrollHeight).toBeGreaterThan(
      managedUserScrollState.clientHeight,
    );
    expect(managedUserScrollState.overflowY).toBe("auto");
    await expect(page.getByText("E2E 審査待ちイベント")).toBeVisible();
    const eventReviewItem = page
      .locator(".admin-review-item")
      .filter({ hasText: "E2E 審査待ちイベント" });
    await eventReviewItem.getByRole("button", { name: "内容を見る" }).click();
    await expect(
      page.getByText("E2Eで確認する学生歓迎の地域イベントです。"),
    ).toBeVisible();
    await expect(page.getByText("地域の人とつながる")).toBeVisible();
    await expect(page.getByText("少人数で話しやすく")).toHaveCount(0);
    await eventReviewItem.getByRole("button", { name: "公開する" }).click();
    await expect(
      page.getByRole("alertdialog", { name: "イベントを公開しますか？" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toBeHidden();

    const dedicatedEventReview = page
      .locator(".admin-review-item")
      .filter({ hasText: `E2E 管理審査イベント ${variant}` });
    if (await dedicatedEventReview.isVisible()) {
      await dedicatedEventReview
        .getByRole("button", { name: "公開する" })
        .click();
      await page
        .getByRole("alertdialog", { name: "イベントを公開しますか？" })
        .getByRole("button", { name: "公開する" })
        .click();
      await expect(page.getByText("イベントを公開しました。")).toBeVisible();
    }
    await expect(dedicatedEventReview).toBeHidden();

    await expect(
      page.getByRole("heading", { name: "アカウント審査" }),
    ).toBeVisible();
    await expect(page.getByText("E2E 承認待ち")).toBeVisible();
    await expect(page.getByRole("heading", { name: "通報" })).toBeVisible();
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

    const accountReviewSection = page.locator(".role-card").filter({
      has: page.getByRole("heading", { name: "アカウント審査" }),
    });
    const dedicatedAccountReview = accountReviewSection
      .locator(".review-row")
      .filter({ hasText: `E2E 審査対象 ${variant}` });
    await dedicatedAccountReview
      .getByRole("button", { name: "承認する" })
      .click();
    await page
      .getByRole("alertdialog", { name: "アカウントを承認しますか？" })
      .getByRole("button", { name: "承認する" })
      .click();
    await expect(page.getByText("アカウントを承認しました。")).toBeVisible();
    await expect(dedicatedAccountReview).toBeHidden();
    await page
      .getByRole("button", { name: "さらに50件読み込む", exact: true })
      .first()
      .click();
    await expect(page.getByText("E2E ページング対象 54")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("admin can complete a reported-content review", async ({
    page,
  }, testInfo) => {
    const variant = projectVariant(testInfo.project.name);
    await login(page, adminEmail(testInfo.project.name), "admin123");

    const report = page
      .locator(".review-row")
      .filter({ hasText: `E2E モデレーション通報 ${variant}` });
    await expect(report).toBeVisible();
    await report.getByRole("button", { name: "対応済み", exact: true }).click();
    const dialog = page.getByRole("alertdialog", {
      name: "通報を対応済みにする",
    });
    await dialog
      .getByLabel("対応内容・記録")
      .fill(`${variant}で内容を確認しました。`);
    await dialog.getByRole("button", { name: "対応済みにする" }).click();
    await expect(page.getByText("通報を対応済みにしました。")).toBeVisible();
    await expect(report).toBeHidden();
    await expectNoHorizontalOverflow(page);
  });

  test("admin can delete reported and directly managed events", async ({
    page,
  }, testInfo) => {
    const variant = projectVariant(testInfo.project.name);
    const deletionReason = `E2E ${variant}で管理者の削除権限と関連データを確認しました。`;
    await login(page, adminEmail(testInfo.project.name), "admin123");

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
    const eventManagementSection = page.locator(".role-card").filter({
      has: page.getByRole("heading", { name: "公開中のイベント" }),
    });
    const loadMoreManagedEvents = eventManagementSection.getByRole("button", {
      name: "さらに50件読み込む",
    });
    if (await loadMoreManagedEvents.isVisible()) {
      await loadMoreManagedEvents.click();
    }
    await expect(directEvent).toBeVisible();
    await directEvent
      .getByRole("button", { name: "削除", exact: true })
      .click();
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
    await expectNoHorizontalOverflow(page);
  });

  test("admin can complete a requested user deletion", async ({
    page,
  }, testInfo) => {
    const variant = projectVariant(testInfo.project.name);
    const deletionReason = `E2E ${variant}で管理者の削除権限と関連データを確認しました。`;
    await login(page, adminEmail(testInfo.project.name), "admin123");

    const deletionQueue = page.locator(".admin-deletion-card");
    await expect(
      deletionQueue.getByRole("heading", {
        name: "退会・データ削除",
      }),
    ).toBeVisible();
    const deletionRequest = deletionQueue
      .locator(".review-row")
      .filter({ hasText: `E2E 削除対象 ${variant}` });
    await expect(deletionRequest).toContainText(
      `E2E ${variant}の退会・データ削除申請です。`,
    );

    const userReport = page
      .locator(".review-row")
      .filter({ hasText: `削除ユーザー通報の匿名化確認 ${variant}` });
    await userReport
      .getByRole("button", { name: "対応済み", exact: true })
      .click();
    const userReportDialog = page.getByRole("alertdialog", {
      name: "通報を対応済みにする",
    });
    await userReportDialog
      .getByLabel("対応内容・記録")
      .fill(`${variant}で削除前の内容を確認しました。`);
    await userReportDialog
      .getByRole("button", { name: "対応済みにする" })
      .click();
    await expect(page.getByText("通報を対応済みにしました。")).toBeVisible();
    await expect(userReport).toBeHidden();

    const userOperations = page.locator(".role-card").filter({
      has: page.getByRole("heading", { name: "ユーザー管理" }),
    });
    const managedUser = userOperations
      .locator(".review-row")
      .filter({ hasText: `E2E 削除対象 ${variant}` });
    const loadMoreUsers = userOperations.getByRole("button", {
      name: "さらに50件読み込む",
    });
    const managedUserRows = userOperations.locator(".review-row");
    for (
      let pageNumber = 0;
      pageNumber < 4 && (await managedUser.count()) === 0;
      pageNumber += 1
    ) {
      if (!(await loadMoreUsers.isVisible())) break;
      const previousCount = await managedUserRows.count();
      await loadMoreUsers.click();
      await expect
        .poll(() => managedUserRows.count())
        .toBeGreaterThan(previousCount);
    }
    await expect(managedUser).toBeVisible();
    await managedUser
      .getByRole("button", { name: "停止", exact: true })
      .click();
    const suspendDialog = page.getByRole("alertdialog", {
      name: "アカウントを停止",
    });
    await suspendDialog.getByLabel("停止理由").fill(deletionReason);
    await suspendDialog.getByRole("button", { name: "利用を停止する" }).click();
    await expect(page.getByText("アカウントを停止しました。")).toBeVisible();
    await page.getByRole("button", { name: "停止中", exact: true }).click();

    const suspendedUser = userOperations
      .locator(".review-row")
      .filter({ hasText: `E2E 削除対象 ${variant}` });
    await deletionRequest
      .getByRole("button", { name: "削除を実行", exact: true })
      .click();
    const userDeleteDialog = page.getByRole("alertdialog", {
      name: "退会申請を承認して削除",
    });
    await userDeleteDialog
      .getByLabel("本人確認・対応記録")
      .fill(deletionReason);
    await userDeleteDialog
      .getByRole("button", { name: "アカウントを完全に削除" })
      .click();
    await expect(
      page.getByText("ユーザーの認証アカウントと関連データを削除しました。"),
    ).toBeVisible();
    await expect(suspendedUser).toBeHidden();
    await expect(deletionRequest).toBeHidden();
    await expectNoHorizontalOverflow(page);
  });
});
