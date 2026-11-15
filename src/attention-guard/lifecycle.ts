import type { AttentionIntervention, AttentionWarningLevel, GuardRunPurpose, GuardStatus } from "./types";

export type AttentionGuardView = "monitor" | "calibrate" | "lab";

export function canStartFocusTrackingFromView(view: AttentionGuardView, focusTimerActive: boolean): boolean {
  return focusTimerActive && view === "monitor";
}

export function isActiveFocusTimer(running: boolean, mode: "focus" | "short" | "long"): boolean {
  return running && mode === "focus";
}

export function canEmitFocusIntervention(
  focusTimerActive: boolean,
  status: GuardStatus,
  runPurpose: GuardRunPurpose | null,
): boolean {
  return focusTimerActive && status === "on" && runPurpose === "focus";
}

export function shouldPauseFocusTimer(level: 1 | 2, strictPause: boolean, focusTimerActive: boolean): boolean {
  return level === 2 && strictPause && focusTimerActive;
}

/** The audible focus alarm is reserved for sustained level-2 drift in a live
 * Focus camera run; it must never sound during calibration, the Test Lab, or breaks. */
export function shouldRunFocusAlarm(input: {
  enabled: boolean;
  offTargetAlertsEnabled: boolean;
  focusTimerActive: boolean;
  status: GuardStatus;
  runPurpose: GuardRunPurpose | null;
  warningLevel: AttentionWarningLevel;
}): boolean {
  return input.enabled
    && input.offTargetAlertsEnabled
    && input.focusTimerActive
    && input.status === "on"
    && input.runPurpose === "focus"
    && input.warningLevel === 2;
}

/** Keep the phone and screen-break chimes independent from the off-target siren. */
export function shouldPlayAttentionWarning(input: {
  soundEnabled: boolean;
  focusAlarmEnabled: boolean;
  offTargetAlertsEnabled: boolean;
  reason: AttentionIntervention["reason"];
  level: 1 | 2;
}): boolean {
  if (!input.soundEnabled) return false;
  if (input.reason === "phone-detected" || input.reason === "screen-break") return true;
  return !(input.level === 2 && input.focusAlarmEnabled && input.offTargetAlertsEnabled);
}
