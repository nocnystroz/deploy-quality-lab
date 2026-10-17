import type { SmokeSuite } from "./types";

export function newSmokeSuite(): SmokeSuite {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: "Nowy smoke suite",
    baseUrl: "https://example.com",
    blockedPatterns: [],
    requestTimeoutMs: 30_000,
    seoRules: {
      titleMinLength: 10,
      titleMaxLength: 60,
      descriptionMinLength: 70,
      descriptionMaxLength: 160,
    },
    cases: [
      {
        id: crypto.randomUUID(),
        name: "Strona główna",
        path: "/",
        expectedStatus: 200,
        actions: [],
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

export function smokeUrl(suite: SmokeSuite, path: string): string {
  return new URL(path, suite.baseUrl).toString();
}
export function validateSmokeSuite(suite: SmokeSuite): string[] {
  const errors: string[] = [];
  try {
    new URL(suite.baseUrl);
  } catch {
    errors.push("Base URL is invalid.");
  }
  if (!suite.name.trim()) errors.push("Suite name is required.");
  if (!suite.cases.length) errors.push("At least one smoke case is required.");
  if (
    suite.seoRules &&
    (suite.seoRules.titleMinLength > suite.seoRules.titleMaxLength ||
      suite.seoRules.descriptionMinLength > suite.seoRules.descriptionMaxLength)
  )
    errors.push("SEO minimum length cannot exceed maximum length.");
  for (const item of suite.cases) {
    if (!item.name.trim()) errors.push("Case name is required.");
    if (item.expectedStatus < 100 || item.expectedStatus > 599)
      errors.push(`Invalid expected status for ${item.name}.`);
    for (const check of item.textChecks ?? []) {
      if (!check.name.trim() || !check.query.trim())
        errors.push(`Text check requires a name and query for ${item.name}.`);
      if (check.source === "regex")
        try {
          new RegExp(check.query);
        } catch {
          errors.push(`Invalid RegExp in text check ${check.name}.`);
        }
      if (
        check.minLength !== undefined &&
        check.maxLength !== undefined &&
        check.minLength > check.maxLength
      )
        errors.push(
          `Text check minimum cannot exceed maximum for ${check.name}.`,
        );
    }
  }
  return errors;
}
