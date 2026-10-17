import { describe, expect, it } from "vitest";
import { comparisonTone, qualityRating } from "./metric-quality";

describe("metric quality", () => {
  it("uses the documented good, needs-improvement and poor CWV bands", () => {
    expect(qualityRating("lcpMs", 2500)).toBe("good");
    expect(qualityRating("inpMs", 350)).toBe("needs-improvement");
    expect(qualityRating("cls", 0.26)).toBe("poor");
  });

  it("marks lower timing and layout values as an improvement", () => {
    expect(comparisonTone(800, 1000)).toBe("better");
    expect(comparisonTone(1200, 1000)).toBe("worse");
    expect(comparisonTone(1000, 1000)).toBe("unchanged");
  });
});
