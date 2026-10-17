import { describe, expect, it } from "vitest";
import { vitalsProbeSource } from "./browser-engine";

describe("vitalsProbeSource", () => {
  it("uses first-input as an INP fallback and observes event entries at 16 ms", () => {
    const observers: {
      callback: (list: { getEntries: () => unknown[] }) => void;
      options?: Record<string, unknown>;
    }[] = [];
    class FakePerformanceObserver {
      static supportedEntryTypes = ["event", "first-input"];
      constructor(callback: (list: { getEntries: () => unknown[] }) => void) {
        observers.push({ callback });
      }
      observe(options: Record<string, unknown>) {
        observers.at(-1)!.options = options;
      }
    }
    const page: Record<string, any> = {};
    new Function("window", "PerformanceObserver", vitalsProbeSource())(
      page,
      FakePerformanceObserver,
    );
    const firstInput = observers.find(
      ({ options }) => options?.type === "first-input",
    )!;
    const events = observers.find(({ options }) => options?.type === "event")!;
    firstInput.callback({
      getEntries: () => [
        { duration: 8, startTime: 5, name: "pointerdown", interactionId: 0 },
      ],
    });
    events.callback({
      getEntries: () => [
        { duration: 120, startTime: 5, name: "click", interactionId: 7 },
      ],
    });
    expect(page.__deploySpeedVitals.inp).toBe(120);
    expect(events.options).toMatchObject({
      buffered: true,
      durationThreshold: 16,
    });
  });
});
