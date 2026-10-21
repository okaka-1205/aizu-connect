import { expect, test, type Page } from "@playwright/test";
import { projectSuffix } from "./testVariants";

async function readFirestoreDocument(path: string) {
  const projectId =
    process.env.VITE_FIREBASE_PROJECT_ID ?? "demo-aizu-connect-admin-approval";
  const port = process.env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT ?? "8080";
  const response = await fetch(
    `http://127.0.0.1:${port}/v1/projects/${projectId}/databases/(default)/documents/${path}`,
    { headers: { Authorization: "Bearer owner" } },
  );
  const body = (await response.json()) as {
    fields?: Record<string, { stringValue?: string }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(
      `Firestore emulator returned ${response.status} for ${path}: ${body.error?.message ?? "unknown error"}`,
    );
  }
  return body;
}

type AdminAction = "approve_user" | "suspend_user" | "restore_user";

async function runAdminAction(
  page: Page,
  uid: string,
  action: AdminAction,
  requestId: string,
) {
  const projectId =
    process.env.VITE_FIREBASE_PROJECT_ID ?? "demo-aizu-connect-admin-approval";
  const port = process.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT ?? "5001";
  return page.evaluate(
    async ({
      projectId: browserProjectId,
      port: browserPort,
      targetId,
      requestedAction,
      clientRequestId,
    }) => {
      const { auth } = await import("/src/lib/firebase.ts");
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Admin authentication token is unavailable.");
      const response = await fetch(
        `http://127.0.0.1:${browserPort}/${browserProjectId}/asia-northeast1/adminManageResource`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            data: {
              action: requestedAction,
              targetId,
              reason: "管理操作の再実行と状態遷移を確認",
              requestId: clientRequestId,
            },
          }),
        },
      );
      const body = (await response.json()) as {
        result?: { status?: string; operationId?: string };
        error?: { message?: string };
      };
      if (!response.ok || !body.result) {
        throw new Error(
          `Admin action failed: ${body.error?.message ?? response.status}`,
        );
      }
      return body.result;
    },
    {
      projectId,
      port,
      targetId: uid,
      requestedAction: action,
      clientRequestId: requestId,
    },
  );
}

test("admin approval synchronizes the user and student profile", async ({
  browser,
  page,
}, testInfo) => {
  const variant = projectSuffix(testInfo.project.name);
  const uid = `approval-sync-${variant}`;
  const displayName = `承認同期テスト ${variant}`;
  const studentPage = await browser.newPage({
    baseURL: `http://127.0.0.1:${process.env.PLAYWRIGHT_TEST_PORT ?? "5173"}`,
  });

  await studentPage.goto("/");
  await studentPage.getByRole("button", { name: "ログイン" }).click();
  await studentPage
    .getByLabel("メールアドレス")
    .fill(`${uid}@example.com`);
  await studentPage
    .getByLabel("パスワード", { exact: true })
    .fill("password123");
  await studentPage.getByRole("button", { name: "ログインする" }).click();
  await expect(
    studentPage.getByRole("heading", {
      name: "運営が登録内容を確認しています",
    }),
  ).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: "ログイン" }).click();
  await page
    .getByLabel("メールアドレス")
    .fill("admin-approval@aizu-connect.local");
  await page.getByLabel("パスワード", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "ログインする" }).click();

  await expect(
    page.getByRole("heading", { name: "アカウント審査" }),
  ).toBeVisible();
  const accountReviewSection = page.locator(".role-card").filter({
    has: page.getByRole("heading", { name: "アカウント審査" }),
  });
  const reviewItem = accountReviewSection
    .locator(".review-row")
    .filter({ hasText: displayName });
  await reviewItem.getByRole("button", { name: "承認する" }).click();
  await page
    .getByRole("alertdialog", { name: "アカウントを承認しますか？" })
    .getByRole("button", { name: "承認する" })
    .click();

  await expect(page.getByText("アカウントを承認しました。")).toBeVisible();
  await expect(reviewItem).toBeHidden();
  await expect(
    studentPage.getByText(
      "管理者の承認が完了しました。Aizu Connectのすべての機能を利用できます。",
    ),
  ).toBeVisible();
  await expect(
    studentPage.getByRole("heading", {
      name: "運営が登録内容を確認しています",
    }),
  ).toBeHidden();
  await expect
    .poll(async () => {
      const [user, profile] = await Promise.all([
        readFirestoreDocument(`users/${uid}`),
        readFirestoreDocument(`studentProfiles/${uid}`),
      ]);
      return {
        user: user.fields?.status?.stringValue,
        profile: profile.fields?.status?.stringValue,
      };
    })
    .toEqual({ user: "active", profile: "active" });

  const adminId = "admin-approval-e2e";
  const replayRequestId = `approvalretry${variant}0001`;
  const replayOperationId =
    `${adminId}_approve_user_${uid}_${replayRequestId}`;
  const firstReplay = await runAdminAction(
    page,
    uid,
    "approve_user",
    replayRequestId,
  );
  expect(await runAdminAction(page, uid, "approve_user", replayRequestId))
    .toEqual(firstReplay);
  expect(firstReplay).toEqual({
    status: "active",
    operationId: replayOperationId,
  });

  const statusTransitions = [
    ["suspend_user", `suspendfirst${variant}0001`, "suspended"],
    ["restore_user", `restorefirst${variant}0001`, "active"],
    ["suspend_user", `suspendagain${variant}0001`, "suspended"],
    ["restore_user", `restoreagain${variant}0001`, "active"],
  ] as const;
  for (const [action, requestId, expectedStatus] of statusTransitions) {
    expect(await runAdminAction(page, uid, action, requestId)).toMatchObject({
      status: expectedStatus,
      operationId: `${adminId}_${action}_${uid}_${requestId}`,
    });
  }
  const [notification, auditLog, operation] = await Promise.all([
    readFirestoreDocument(
      `notifications/account_review_${replayOperationId}`,
    ),
    readFirestoreDocument(`auditLogs/${replayOperationId}`),
    readFirestoreDocument(`adminOperations/${replayOperationId}`),
  ]);
  expect(notification.fields?.type?.stringValue).toBe("account_approved");
  expect(auditLog.fields?.action?.stringValue).toBe("user_approve");
  expect(operation.fields?.status?.stringValue).toBe("completed");
  await studentPage.close();
});
