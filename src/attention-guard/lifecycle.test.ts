import { describe, expect, it } from "vitest";
import { canEmitFocusIntervention, canStartFocusTrackingFromView, isActiveFocusTimer, shouldPauseFocusTimer, shouldPlayAttentionWarning, shouldRunFocusAlarm } from "./lifecycle";

describe("Attention Guard focus lifecycle", () => {
  it("allows focus tracking only while the Focus timer is running", () => {
    expect(isActiveFocusTimer(true, "focus")).toBe(true);
    expect(isActiveFocusTimer(false, "focus")).toBe(false);
    expect(isActiveFocusTimer(true, "short")).toBe(false);
    expect(isActiveFocusTimer(true, "long")).toBe(false);
  });

  it("keeps ordinary focus tracking in Monitor, separate from temporary calibration and lab cameras", () => {
    expect(canStartFocusTrackingFromView("monitor", true)).toBe(true);
    expect(canStartFocusTrackingFromView("monitor", false)).toBe(false);
    expect(canStartFocusTrackingFromView("calibrate", true)).toBe(false);
    expect(canStartFocusTrackingFromView("lab", true)).toBe(false);
  });

  it("emits interventions only from a live focus-purpose camera run", () => {
    expect(canEmitFocusIntervention(true, "on", "focus")).toBe(true);
    expect(canEmitFocusIntervention(false, "on", "focus")).toBe(false);
    expect(canEmitFocusIntervention(true, "starting", "focus")).toBe(false);
    expect(canEmitFocusIntervention(true, "on", "diagnostic")).toBe(false);
    expect(canEmitFocusIntervention(true, "on", "calibration")).toBe(false);
    expect(canEmitFocusIntervention(true, "off", null)).toBe(false);
  });

  it("honors strict pause only for a level 2 warning during active focus", () => {
    expect(shouldPauseFocusTimer(1, true, true)).toBe(false);
    expect(shouldPauseFocusTimer(2, false, true)).toBe(false);
    expect(shouldPauseFocusTimer(2, true, false)).toBe(false);
    expect(shouldPauseFocusTimer(2, true, true)).toBe(true);
  });

  it("runs the loud alarm only for enabled level-2 off-target warnings in a live Focus run", () => {
    const focusAlarm = {
      enabled: true,
      offTargetAlertsEnabled: true,
      focusTimerActive: true,
      status: "on" as const,
      runPurpose: "focus" as const,
      warningLevel: 2 as const,
    };
    expect(shouldRunFocusAlarm(focusAlarm)).toBe(true);
    expect(shouldRunFocusAlarm({ ...focusAlarm, warningLevel: 1 })).toBe(false);
    expect(shouldRunFocusAlarm({ ...focusAlarm, enabled: false })).toBe(false);
    expect(shouldRunFocusAlarm({ ...focusAlarm, offTargetAlertsEnabled: false })).toBe(false);
    expect(shouldRunFocusAlarm({ ...focusAlarm, focusTimerActive: false })).toBe(false);
    expect(shouldRunFocusAlarm({ ...focusAlarm, status: "starting" })).toBe(false);
    expect(shouldRunFocusAlarm({ ...focusAlarm, runPurpose: "calibration" })).toBe(false);
  });

  it("preserves phone and screen-break chimes when the loud off-target alarm is enabled", () => {
    const warning = {
      soundEnabled: true,
      focusAlarmEnabled: true,
      offTargetAlertsEnabled: true,
      level: 2 as const,
    };
    expect(shouldPlayAttentionWarning({ ...warning, reason: "looking-away" })).toBe(false);
    expect(shouldPlayAttentionWarning({ ...warning, reason: "phone-detected" })).toBe(true);
    expect(shouldPlayAttentionWarning({ ...warning, reason: "screen-break" })).toBe(true);
    expect(shouldPlayAttentionWarning({ ...warning, reason: "looking-away", soundEnabled: false })).toBe(false);
  });
});
