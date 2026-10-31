import type { Page } from "@playwright/test";
import ts from "typescript";

type Failure = {
  operation: string;
  mode: "immediate" | "deferred";
  targetId?: string;
  repeat?: boolean;
};
declare global {
  interface Window {
    engagementFailure?: Failure;
    engagementCalls?: Record<string, number>;
  }
}

export async function installEngagementFailures(page: Page) {
  await page.route(
    /\/src\/repositories\/engagementRepository\.ts(?:\?.*)?$/,
    async (route) => {
      const response = await route.fetch();
      let source = await response.text();
      const ast = ts.createSourceFile(
        "engagement.js",
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JS,
      );
      const operations = new Set([
        "saveEventSurvey",
        "saveAdminAssignment",
        "loadAdminAssignment",
        "loadEventSurveyPage",
        "loadEventSurveySummary",
      ]);
      const changes: { start: number; end: number; replacement: string }[] = [];
      function visit(node: ts.Node) {
        if (
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          operations.has(node.name.text) &&
          node.initializer
        ) {
          const operation = node.name.text;
          changes.push({
            start: node.initializer.getStart(ast),
            end: node.initializer.end,
            replacement: `(...args) => {
          const operation = ${JSON.stringify(operation)};
          window.engagementCalls ??= {};
          window.engagementCalls[operation] = (window.engagementCalls[operation] || 0) + 1;
          const failure = window.engagementFailure;
          if (failure?.operation === operation && (!failure.targetId || args[1] === failure.targetId)) {
            if (!failure.repeat) delete window.engagementFailure;
            const error = new Error("検証用の" + operation + "失敗");
            if (failure.mode === "deferred") return new Promise((_, reject) => document.addEventListener("aizu-e2e:engagement-error", () => reject(error), { once: true }));
            return Promise.reject(error);
          }
          return (${node.initializer.getText(ast)})(...args);
        }`,
          });
        }
        ts.forEachChild(node, visit);
      }
      visit(ast);
      if (changes.length !== operations.size)
        throw new Error(
          "Engagement operations unavailable for failure testing.",
        );
      for (const change of changes.sort((a, b) => b.start - a.start))
        source =
          source.slice(0, change.start) +
          change.replacement +
          source.slice(change.end);
      await route.fulfill({ response, body: source });
    },
  );
}

export const failEngagementOperation = (
  page: Page,
  operation: string,
  mode: Failure["mode"],
) =>
  page.evaluate(
    (failure) => {
      window.engagementFailure = failure;
      window.engagementCalls ??= {};
      window.engagementCalls[failure.operation] = 0;
    },
    { operation, mode, repeat: operation.startsWith("load") },
  );

export const clearEngagementFailure = (page: Page) =>
  page.evaluate(() => {
    delete window.engagementFailure;
  });

export const rejectEngagementOperation = (page: Page) =>
  page.evaluate(() =>
    document.dispatchEvent(new Event("aizu-e2e:engagement-error")),
  );
