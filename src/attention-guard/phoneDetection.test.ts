import { describe, expect, it } from "vitest";
import { createPhoneAlertMemory, PHONE_DETECTION_MIN_CONFIDENCE, updatePhoneAlert } from "./phoneDetection";

describe("visible-phone alarm evidence", () => {
  it("requires two high-confidence detections within the evidence window", () => {
    const first = updatePhoneAlert(createPhoneAlertMemory(), 1_000, PHONE_DETECTION_MIN_CONFIDENCE);
    expect(first.shouldAlert).toBe(false);

    const second = updatePhoneAlert(first.memory, 2_000, 0.82);
    expect(second.shouldAlert).toBe(true);
    expect(second.memory.latched).toBe(true);
  });

  it("ignores a single noisy detection and low-confidence boxes", () => {
    const first = updatePhoneAlert(createPhoneAlertMemory(), 1_000, 0.91);
    const low = updatePhoneAlert(first.memory, 1_800, PHONE_DETECTION_MIN_CONFIDENCE - 0.01);
    expect(low.shouldAlert).toBe(false);

    const second = updatePhoneAlert(low.memory, 2_100, 0.52);
    expect(second.shouldAlert).toBe(false);
  });

  it("expires evidence that is too far apart", () => {
    const first = updatePhoneAlert(createPhoneAlertMemory(), 1_000, 0.8);
    const second = updatePhoneAlert(first.memory, 1_000 + 4_001, 0.8);
    expect(second.shouldAlert).toBe(false);
  });

  it("alerts once while a phone remains visible and rearms after it disappears", () => {
    const first = updatePhoneAlert(createPhoneAlertMemory(), 1_000, 0.8);
    const alerted = updatePhoneAlert(first.memory, 1_500, 0.8);
    expect(alerted.shouldAlert).toBe(true);

    const stillVisible = updatePhoneAlert(alerted.memory, 2_000, 0.9);
    expect(stillVisible.shouldAlert).toBe(false);

    const absent = updatePhoneAlert(stillVisible.memory, 7_100, 0);
    expect(absent.memory.latched).toBe(false);
    const returnFirst = updatePhoneAlert(absent.memory, 7_500, 0.9);
    const returnSecond = updatePhoneAlert(returnFirst.memory, 8_000, 0.9);
    expect(returnFirst.shouldAlert).toBe(false);
    expect(returnSecond.shouldAlert).toBe(true);
  });

  it("ignores duplicate or out-of-order results", () => {
    const first = updatePhoneAlert(createPhoneAlertMemory(), 2_000, 0.9);
    const duplicate = updatePhoneAlert(first.memory, 2_000, 0.9);
    const older = updatePhoneAlert(duplicate.memory, 1_500, 0.9);
    expect(duplicate.shouldAlert).toBe(false);
    expect(older.shouldAlert).toBe(false);
    expect(older.memory).toEqual(first.memory);
  });
});
