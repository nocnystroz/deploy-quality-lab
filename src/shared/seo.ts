import type { SeoCheck, SmokeSuite } from "./types";

export const seoChecks: readonly SeoCheck[] = [
  "title",
  "metaDescription",
  "canonical",
  "hreflang",
  "robots",
  "htmlLang",
  "h1",
];

/** Adds the selected local SEO assertions to every scenario in a smoke suite. */
export function applySeoChecks(
  suite: SmokeSuite,
  selected: SeoCheck[],
): SmokeSuite {
  const unique = seoChecks.filter((check) => selected.includes(check));
  return {
    ...suite,
    cases: suite.cases.map((item) => ({ ...item, seoChecks: unique })),
    updatedAt: new Date().toISOString(),
  };
}
