export type AttentionMode = "screen" | "book";

/** Normalized face rectangle in the unmirrored camera frame. */
export type FaceBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Numeric-only outputs from the local inference worker. No image or landmark arrays cross this boundary. */
export type RawAttentionSignals = {
  sampledAt: number;
  facePresent: boolean;
  landmarkCount: number;
  faceBounds: FaceBounds | null;
  yawDeg: number | null;
  pitchDeg: number | null;
  rollDeg: number | null;
  /** Iris position within the eye-box, normalized to -1..1. */
  gazeX: number | null;
  gazeY: number | null;
  faceWidth: number | null;
  brightness: number | null;
  eyeBlinkLeft: number | null;
  eyeBlinkRight: number | null;
};

export type AttentionWarningLevel = 0 | 1 | 2;
export type AttentionPhase = "waiting" | "needs-calibration" | "attentive" | "drifting" | "away" | "face-missing" | "low-quality";
export type AttentionReason = "waiting-for-signals" | "profile-not-calibrated" | "within-zone" | "looking-away" | "face-not-detected" | "lighting-too-low" | "face-too-small" | "insufficient-signals" | "screen-break" | "phone-detected";

export type AttentionClassification = {
  phase: AttentionPhase;
  reason: AttentionReason;
  score: number | null;
  warningLevel: AttentionWarningLevel;
  updatedAt: number;
};

export type AttentionIntervention = {
  level: 1 | 2;
  score: number;
  reason: AttentionReason;
  triggeredAt: number;
};

export type GuardStatus = "off" | "starting" | "on" | "paused" | "error";
export type GuardRunPurpose = "focus" | "calibration" | "diagnostic";
export type GuardStartupStage = "requesting-permission" | "retrying-default-camera" | "starting-camera" | "checking-deployment" | "loading-model" | null;

export type CameraDevice = {
  deviceId: string;
  label: string;
};

export type GuardRuntimeState = {
  status: GuardStatus;
  error: string;
  devices: CameraDevice[];
  devicesReady: boolean;
  selectedDeviceId: string;
  activeDeviceId: string;
  runPurpose: GuardRunPurpose | null;
  startupStage: GuardStartupStage;
  phoneDetectionStatus: "off" | "loading" | "ready" | "error";
  phoneDetectionError: string;
};

export type WorkerInitMessage = {
  type: "init";
  modelUrl: string;
  wasmBaseUrl: string;
  phoneDetectorModelUrl: string;
  phoneDetectorWasmBaseUrl: string;
  phoneDetectionEnabled: boolean;
};

export type WorkerPhoneDetectionMessage = {
  type: "phone-detection";
  enabled: boolean;
};

export type WorkerFrameMessage = {
  type: "frame";
  frameId: number;
  bitmap: ImageBitmap;
  timestamp: number;
};

export type WorkerDisposeMessage = { type: "dispose" };

export type AttentionWorkerRequest = WorkerInitMessage | WorkerPhoneDetectionMessage | WorkerFrameMessage | WorkerDisposeMessage;

export type AttentionWorkerResponse =
  | { type: "ready" }
  | { type: "phone-detection-state"; status: "off" | "loading" | "ready" | "error"; message?: string }
  | { type: "phone-detection-result"; detectedAt: number; confidence: number }
  | { type: "signals"; frameId: number; signals: RawAttentionSignals }
  | { type: "error"; message: string };
