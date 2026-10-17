import type { Metrics } from "./types";

export type QualityRating = "good" | "needs-improvement" | "poor";
export type ComparisonTone = "better" | "worse" | "unchanged";

type RatedMetric = "ttfbMs" | "fcpMs" | "lcpMs" | "cls" | "inpMs";

/** Google-recommended thresholds. TTFB and FCP are supporting metrics, not CWV. */
export const qualityThresholds: Record<RatedMetric, readonly [number, number]> =
  {
    ttfbMs: [800, 1800],
    fcpMs: [1800, 3000],
    lcpMs: [2500, 4000],
    cls: [0.1, 0.25],
    inpMs: [200, 500],
  };

export function qualityRating(
  metric: keyof Metrics,
  value?: number,
): QualityRating | undefined {
  if (typeof value !== "number" || !(metric in qualityThresholds))
    return undefined;
  const [good, poor] = qualityThresholds[metric as RatedMetric];
  return value <= good ? "good" : value <= poor ? "needs-improvement" : "poor";
}

/** Every compared metric in this UI is lower-is-better. */
export function comparisonTone(
  current?: number,
  baseline?: number,
): ComparisonTone | undefined {
  if (typeof current !== "number" || typeof baseline !== "number")
    return undefined;
  if (current === baseline) return "unchanged";
  return current < baseline ? "better" : "worse";
}
