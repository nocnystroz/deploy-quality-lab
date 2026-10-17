import { describe, expect, it } from "vitest";
import { newSmokeSuite } from "./smoke";
import { applySeoChecks, seoChecks } from "./seo";

describe("applySeoChecks", () => {
  it("adds every SEO assertion to every scenario", () => {
    const suite = newSmokeSuite();
    suite.cases.push({
      id: "second",
      name: "Second",
      path: "/second",
      expectedStatus: 200,
      actions: [],
    });
    expect(
      applySeoChecks(suite, [...seoChecks]).cases.every(
        (item) => item.seoChecks?.length === seoChecks.length,
      ),
    ).toBe(true);
  });

  it("keeps only selected, supported SEO assertions", () => {
    const suite = newSmokeSuite();
    expect(
      applySeoChecks(suite, ["canonical", "title"]).cases[0].seoChecks,
    ).toEqual(["title", "canonical"]);
  });

  it("starts with editable title and description length limits", () => {
    expect(newSmokeSuite().seoRules).toEqual({
      titleMinLength: 10,
      titleMaxLength: 60,
      descriptionMinLength: 70,
      descriptionMaxLength: 160,
    });
  });
});
