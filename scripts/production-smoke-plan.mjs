import process from "node:process";

const requiredVariables = [
  "AIZU_CONNECT_SMOKE_STUDENT_EMAIL",
  "AIZU_CONNECT_SMOKE_ORGANIZATION_EMAIL",
  "AIZU_CONNECT_SMOKE_ADMIN_EMAIL",
];
const missing = requiredVariables.filter((name) => !process.env[name]?.trim());

if (missing.length > 0) {
  console.error(
    `専用スモークアカウントを指定してください: ${missing.join(", ")}`,
  );
  process.exitCode = 1;
} else {
  console.log("Aizu Connect 本番スモークテスト実行計画（読み取り専用）");
  console.log(`対象URL: ${process.env.AIZU_CONNECT_SMOKE_URL ?? "https://aizu-connect-prod.web.app/"}`);
  console.log(`学生: ${process.env.AIZU_CONNECT_SMOKE_STUDENT_EMAIL}`);
  console.log(`主催者: ${process.env.AIZU_CONNECT_SMOKE_ORGANIZATION_EMAIL}`);
  console.log(`管理者: ${process.env.AIZU_CONNECT_SMOKE_ADMIN_EMAIL}`);
  console.log("このコマンドは本番へ接続せず、データも変更しません。");
  console.log("実行前に docs/production-smoke-test.md の影響範囲と後片付けを確認してください。");
}
