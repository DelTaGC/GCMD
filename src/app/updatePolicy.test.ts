import { describe, expect, it } from "vitest";
import type { UpdateSettings } from "../ipc/settings";
import {
  CHECK_INTERVAL_MS,
  otherWindowsText,
  progressText,
  shouldAnnounce,
  shouldAutoCheck,
} from "./updatePolicy";

const base: UpdateSettings = { check: "auto", lastCheckMs: null, skippedVersion: null };
const now = 1_800_000_000_000;

describe("shouldAutoCheck", () => {
  it("checks when never checked before", () => {
    expect(shouldAutoCheck(base, now)).toBe(true);
  });

  it("waits a day between checks", () => {
    expect(shouldAutoCheck({ ...base, lastCheckMs: now - 1000 }, now)).toBe(false);
    expect(shouldAutoCheck({ ...base, lastCheckMs: now - CHECK_INTERVAL_MS }, now)).toBe(true);
  });

  it("checks again when the last check lies in the future", () => {
    expect(shouldAutoCheck({ ...base, lastCheckMs: now + 60_000 }, now)).toBe(true);
  });

  it("never checks automatically in manual mode", () => {
    expect(shouldAutoCheck({ ...base, check: "manual" }, now)).toBe(false);
  });
});

describe("shouldAnnounce", () => {
  const skipped = { ...base, skippedVersion: "0.2.0" };

  it("hides a skipped version from automatic checks only", () => {
    expect(shouldAnnounce("0.2.0", skipped, false)).toBe(false);
    expect(shouldAnnounce("0.2.0", skipped, true)).toBe(true);
  });

  it("announces a newer version than the skipped one", () => {
    expect(shouldAnnounce("0.3.0", skipped, false)).toBe(true);
  });
});

describe("texts", () => {
  it("shows a percentage only when the size is known", () => {
    expect(progressText("0.2.0", null)).toBe("Downloading GCMD 0.2.0...");
    expect(progressText("0.2.0", { downloaded: 5, total: null })).toBe("Downloading GCMD 0.2.0...");
    expect(progressText("0.2.0", { downloaded: 421, total: 1000 })).toBe(
      "Downloading GCMD 0.2.0... 42 %",
    );
    expect(progressText("0.2.0", { downloaded: 2000, total: 1000 })).toBe(
      "Downloading GCMD 0.2.0... 100 %",
    );
  });

  it("counts other windows in words", () => {
    expect(otherWindowsText(1)).toContain("another GCMD window is open. Save and close it,");
    expect(otherWindowsText(3)).toContain("3 other GCMD windows are open. Save and close them,");
  });
});
