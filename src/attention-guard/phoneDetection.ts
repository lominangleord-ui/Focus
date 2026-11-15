export const PHONE_DETECTION_MIN_CONFIDENCE = 0.56;
export const PHONE_EVIDENCE_WINDOW_MS = 4_000;
export const PHONE_REARM_DELAY_MS = 5_000;
export const PHONE_EVIDENCE_HITS_REQUIRED = 2;

export type PhoneAlertMemory = {
  recentPositiveAt: number[];
  lastDetectionAt: number | null;
  lastPositiveAt: number | null;
  latched: boolean;
};

export function createPhoneAlertMemory(): PhoneAlertMemory {
  return {
    recentPositiveAt: [],
    lastDetectionAt: null,
    lastPositiveAt: null,
    latched: false,
  };
}

/** Require independent, high-confidence detector hits before sounding an alarm.
 * A phone that stays in frame produces one alert; it rearms after five seconds
 * without a positive detection so a later appearance can alert again. */
export function updatePhoneAlert(
  memory: PhoneAlertMemory,
  detectedAt: number,
  confidence: number,
): { memory: PhoneAlertMemory; shouldAlert: boolean } {
  if (!Number.isFinite(detectedAt) || !Number.isFinite(confidence)
    || (memory.lastDetectionAt != null && detectedAt <= memory.lastDetectionAt)) {
    return { memory, shouldAlert: false };
  }

  const recentPositiveAt = memory.recentPositiveAt.filter((at) => detectedAt - at <= PHONE_EVIDENCE_WINDOW_MS);
  const isPositive = confidence >= PHONE_DETECTION_MIN_CONFIDENCE;
  if (isPositive) {
    recentPositiveAt.push(detectedAt);
    const shouldAlert = !memory.latched && recentPositiveAt.length >= PHONE_EVIDENCE_HITS_REQUIRED;
    return {
      memory: {
        recentPositiveAt,
        lastDetectionAt: detectedAt,
        lastPositiveAt: detectedAt,
        latched: memory.latched || shouldAlert,
      },
      shouldAlert,
    };
  }

  const rearmed = memory.lastPositiveAt != null && detectedAt - memory.lastPositiveAt >= PHONE_REARM_DELAY_MS;
  return {
    memory: rearmed
      ? { ...createPhoneAlertMemory(), lastDetectionAt: detectedAt }
      : { ...memory, recentPositiveAt, lastDetectionAt: detectedAt },
    shouldAlert: false,
  };
}
