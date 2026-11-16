import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const port = 15177;
const origin = `http://127.0.0.1:${port}`;
if (process.env.GCLOUD_PROJECT !== "demo-aizu-connect-readme") {
  throw new Error(
    "Run npm run screenshots:readme to use the dedicated demo environment.",
  );
}
try {
  await fetch(origin);
  throw new Error(`Port ${port} is already in use.`);
} catch (error) {
  if (error.message.includes("already in use")) throw error;
}

const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
    "--mode",
    "emulator",
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      VITE_USE_FIREBASE_EMULATORS: "true",
      VITE_FIREBASE_API_KEY: "demo",
      VITE_FIREBASE_PROJECT_ID: "demo-aizu-connect-readme",
      VITE_FIREBASE_AUTH_DOMAIN: "demo-aizu-connect-readme.firebaseapp.com",
      VITE_FIREBASE_STORAGE_BUCKET: "demo-aizu-connect-readme.appspot.com",
      VITE_FIREBASE_APP_ID: "demo",
      VITE_FIREBASE_MESSAGING_SENDER_ID: "0",
      VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:19099",
      VITE_FIREBASE_FIRESTORE_EMULATOR_PORT: "18082",
      VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT: "15001",
      VITE_FIREBASE_STORAGE_EMULATOR_PORT: "19197",
    },
    stdio: "inherit",
  },
);
let browser;
try {
  for (let attempt = 0; ; attempt++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {
      /* Wait for Vite's initial startup. */
    }
    if (attempt >= 100 || server.exitCode !== null)
      throw new Error("Vite did not start.");
    await delay(100);
  }
  browser = await chromium.launch();
  const errors = [];
  const participantDir = path.join(root, "docs/screenshots/participant");
  const organizationDir = path.join(root, "docs/screenshots/organization");
  await Promise.all([
    mkdir(participantDir, { recursive: true }),
    mkdir(organizationDir, { recursive: true }),
  ]);
  async function openPage(mobile = false) {
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
      isMobile: mobile,
      hasTouch: mobile,
      locale: "ja-JP",
      timezoneId: "Asia/Tokyo",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.setFixedTime(new Date("2026-11-13T12:00:00+09:00"));
    return page;
  }
  async function login(page, email) {
    await page.goto(origin);
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    await page.getByLabel("メールアドレス").fill(email);
    await page
      .getByLabel("パスワード", { exact: true })
      .fill("readme-demo-password");
    await page.getByRole("button", { name: "ログインする" }).click();
    await page.locator(".app-shell, .organization-shell").waitFor();
  }
  async function capture(page, directory, filename, fullPage = false) {
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images].map((image) => image.decode().catch(() => {})),
      );
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      const messages = document.querySelector(".chat-messages");
      if (messages) messages.scrollTop = messages.scrollHeight;
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(await page.locator(".notice.is-error").count()).toBe(0);
    expect(
      await page
        .locator("img")
        .evaluateAll(
          (images) =>
            images.filter((image) => image.offsetWidth && !image.naturalWidth)
              .length,
        ),
    ).toBe(0);
    await page.screenshot({
      path: path.join(directory, filename),
      animations: "disabled",
      fullPage,
    });
    console.log(`Captured ${filename}`);
  }
  const desktop = await openPage();
  await login(desktop, "readme-student@u-aizu.ac.jp");
  await expect(desktop.locator(".home-page .event-card")).toHaveCount(4);
  await capture(desktop, participantDir, "01-desktop-home.png", true);
  const nav = desktop.getByRole("navigation", { name: "メインナビゲーション" });
  await nav.getByRole("button", { name: "探す", exact: true }).click();
  await expect(desktop.locator(".search-results .event-card")).toHaveCount(6);
  await capture(desktop, participantDir, "02-desktop-search.png", true);
  await desktop
    .getByRole("button", {
      name: "学生と地域で考える、まちのアイデア会議の詳細を見る",
    })
    .click();
  await desktop.getByRole("dialog").waitFor();
  await capture(desktop, participantDir, "03-desktop-event-detail.png");
  await desktop.keyboard.press("Escape");
  await nav.getByRole("button", { name: "活動", exact: true }).click();
  await expect(desktop.locator(".application-item")).toHaveCount(3);
  await capture(desktop, participantDir, "04-desktop-activity.png", true);
  await nav.getByRole("button", { name: "メッセージ", exact: true }).click();
  await desktop
    .locator(".conversation-item")
    .filter({ hasText: "はじめての地域交流カフェ" })
    .click();
  await expect(desktop.locator(".chat-message")).toHaveCount(2);
  await capture(desktop, participantDir, "05-desktop-messages.png");
  await nav.getByRole("button", { name: /^プロフィール/ }).click();
  await expect(desktop.locator(".saved-event-item")).toHaveCount(2);
  await capture(desktop, participantDir, "06-desktop-profile.png", true);

  const mobile = await openPage(true);
  await login(mobile, "readme-student@u-aizu.ac.jp");
  await expect(mobile.locator(".home-page .event-card")).toHaveCount(4);
  await capture(mobile, participantDir, "07-mobile-home.png");
  const mobileNav = mobile.getByRole("navigation", {
    name: "メインナビゲーション",
  });
  await mobileNav.getByRole("button", { name: "探す", exact: true }).click();
  await mobile
    .getByRole("button", {
      name: "学生と地域で考える、まちのアイデア会議の詳細を見る",
    })
    .click();
  await mobile.getByRole("dialog").waitFor();
  await capture(mobile, participantDir, "08-mobile-event-detail.png");
  await mobile.keyboard.press("Escape");
  await mobile
    .getByRole("navigation", { name: "メインナビゲーション" })
    .getByRole("button", { name: "メッセージ", exact: true })
    .click();
  const mobileRoom = mobile.locator(".conversation-item").filter({
    hasText: "はじめての地域交流カフェ",
  });
  if (await mobileRoom.isVisible()) await mobileRoom.click();
  await expect(mobile.locator(".chat-panel-title strong")).toHaveText(
    "はじめての地域交流カフェ",
  );
  await expect(mobile.locator(".chat-message")).toHaveCount(2);
  await capture(mobile, participantDir, "09-mobile-messages.png");

  const organization = await openPage();
  await login(organization, "readme-org@example.com");
  await organization.locator(".organization-home-card").waitFor();
  await expect(
    organization.locator(".organization-home-summary strong").first(),
  ).toHaveText("7");
  await capture(organization, organizationDir, "01-desktop-home.png", true);
  await organization.getByRole("button", { name: /^イベント/ }).click();
  await organization
    .locator(".managed-event-row .role-list-item")
    .filter({ hasText: "はじめての地域交流カフェ" })
    .click();
  await expect(organization.locator(".applicant-row")).toHaveCount(4);
  await capture(
    organization,
    organizationDir,
    "02-desktop-participants.png",
    true,
  );
  await organization
    .getByRole("button", { name: "団体ホーム", exact: true })
    .click();
  await organization.setViewportSize({ width: 390, height: 844 });
  await capture(organization, organizationDir, "03-mobile-home.png");
  expect(errors).toEqual([]);
  console.log(
    "All 12 README screenshots captured without layout or image errors.",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
