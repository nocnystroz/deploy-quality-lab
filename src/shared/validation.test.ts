import { describe, expect, it } from "vitest";
import { newProfile } from "./defaults";
import { validateProfile } from "./validation";

describe("validateProfile", () => {
  it("requires a target URL for a new profile", () =>
    expect(validateProfile(newProfile())).toContain(
      "At least one URL is required.",
    ));
  it("accepts a configured profile with explicit default test settings", () => {
    const profile = newProfile();
    profile.urls = ["https://example.com"];
    expect(profile).toMatchObject({
      cpuSlowdown: 1,
      network: { downloadKbps: 0, uploadKbps: 0, latencyMs: 0 },
      viewport: {
        width: 1366,
        height: 768,
        deviceScaleFactor: 1,
        mobile: false,
      },
    });
    expect(validateProfile(profile)).toEqual([]);
  });
  it("reports invalid urls and actions", () => {
    const profile = newProfile();
    profile.urls = ["wat"];
    profile.actions = [{ type: "click", selector: "", timeoutMs: 1 }];
    expect(validateProfile(profile)).toHaveLength(2);
  });
});
