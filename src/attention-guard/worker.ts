import type { DetectedObject, ObjectDetection } from "@tensorflow-models/coco-ssd";
import type { AttentionWorkerRequest, AttentionWorkerResponse } from "./types";
import { extractRawSignals } from "./signals";

type WorkerScope = {
  onmessage: ((event: MessageEvent<AttentionWorkerRequest>) => void) | null;
  postMessage: (message: AttentionWorkerResponse) => void;
  fetch: typeof fetch;
  location: Location;
  close: () => void;
};

type Landmarker = {
  detectForVideo: (frame: ImageBitmap, timestamp: number) => import("@mediapipe/tasks-vision").FaceLandmarkerResult;
  close: () => void;
};

type PhoneDetector = ObjectDetection;

const scope = globalThis as unknown as WorkerScope;
const PHONE_DETECTION_INTERVAL_MS = 900;
const PHONE_DETECTION_MODEL_MIN_SCORE = 0.2;
const PHONE_DETECTION_IMAGE_SIZE = 300;
let landmarker: Landmarker | null = null;
let brightnessCanvas: OffscreenCanvas | null = null;
let phoneCanvas: OffscreenCanvas | null = null;
let phoneContext: OffscreenCanvasRenderingContext2D | null = null;
let phoneDetector: PhoneDetector | null = null;
let phoneModelLoadPromise: Promise<PhoneDetector> | null = null;
let phoneDetectorModelUrl = "";
let phoneDetectorWasmBaseUrl = "";
let phoneDetectionEnabled = false;
let phoneDetectionFaulted = false;
let phoneDetectionGeneration = 0;
let phoneDetectionInFlight = false;
let disposePhoneDetectorWhenIdle = false;
let lastPhoneDetectionAt = Number.NEGATIVE_INFINITY;
let faceModelReady = false;
let lastTimestamp = 0;

/** The SDK queues performance telemetry to Google; keep all worker fetches same-origin. */
function blockExternalWorkerFetches() {
  const nativeFetch = scope.fetch.bind(scope);
  scope.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl = input instanceof Request ? input.url : input instanceof URL ? input.href : String(input);
    let requestUrl: URL;
    try {
      requestUrl = new URL(rawUrl, scope.location.href);
    } catch {
      return Promise.reject(new TypeError("Attention Guard blocked an invalid worker request."));
    }
    if (requestUrl.origin !== scope.location.origin) {
      return Promise.reject(new TypeError("Attention Guard blocks external worker requests."));
    }
    return nativeFetch(input, init);
  };
}

function estimateBrightness(bitmap: ImageBitmap): number | null {
  if (typeof OffscreenCanvas === "undefined") return null;
  try {
    brightnessCanvas ??= new OffscreenCanvas(48, 27);
    const context = brightnessCanvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, brightnessCanvas.width, brightnessCanvas.height);
    const { data } = context.getImageData(0, 0, brightnessCanvas.width, brightnessCanvas.height);
    let sum = 0;
    let count = 0;
    // Every fourth pixel is sufficient for a coarse lighting diagnostic.
    for (let i = 0; i < data.length; i += 16) {
      sum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      count += 1;
    }
    return count ? sum / count : null;
  } catch {
    return null;
  }
}

function postPhoneDetectionState(status: "off" | "loading" | "ready" | "error", message?: string) {
  scope.postMessage({ type: "phone-detection-state", status, ...(message ? { message } : {}) });
}

function disposePhoneDetector() {
  phoneDetector?.dispose();
  phoneDetector = null;
  disposePhoneDetectorWhenIdle = false;
}

async function loadPhoneDetector(): Promise<PhoneDetector> {
  if (!phoneDetectorModelUrl || !phoneDetectorWasmBaseUrl) throw new Error("A bundled phone detector asset URL is missing.");
  const modelUrl = new URL(phoneDetectorModelUrl, scope.location.href);
  const wasmBaseUrl = new URL(phoneDetectorWasmBaseUrl, scope.location.href);
  if (modelUrl.origin !== scope.location.origin || wasmBaseUrl.origin !== scope.location.origin) {
    throw new Error("The optional phone model and WebAssembly files must load from this app's origin.");
  }
  if (typeof OffscreenCanvas === "undefined") {
    throw new Error("This browser cannot analyze camera frames in the local phone detector.");
  }

  const tf = await import("@tensorflow/tfjs-core");
  const wasm = await import("@tensorflow/tfjs-backend-wasm");
  wasm.setWasmPaths(wasmBaseUrl.href.endsWith("/") ? wasmBaseUrl.href : `${wasmBaseUrl.href}/`, true);
  wasm.setThreadsCount(1);
  // Avoid requiring cross-origin isolation or blob workers for a threaded WASM
  // backend. The non-threaded SIMD binary remains local and fast in this worker.
  tf.env().set("WASM_HAS_MULTITHREAD_SUPPORT", false);
  const backendReady = await tf.setBackend("wasm");
  if (!backendReady) throw new Error("The local TensorFlow WebAssembly backend could not be started.");
  await tf.ready();

  const { load } = await import("@tensorflow-models/coco-ssd");
  return load({ base: "mobilenet_v1", modelUrl: modelUrl.href });
}

function getPhoneModelLoadPromise() {
  if (phoneModelLoadPromise) return phoneModelLoadPromise;
  const request = loadPhoneDetector();
  phoneModelLoadPromise = request;
  void request.then(
    () => { if (phoneModelLoadPromise === request) phoneModelLoadPromise = null; },
    () => { if (phoneModelLoadPromise === request) phoneModelLoadPromise = null; },
  );
  return request;
}

function failPhoneDetector(generation: number, error: unknown) {
  if (generation !== phoneDetectionGeneration || !phoneDetectionEnabled) return;
  phoneDetectionFaulted = true;
  const detail = error instanceof Error ? error.message : "Phone model inference failed.";
  postPhoneDetectionState("error", `Visible-phone detection is unavailable: ${detail}`);
  if (phoneDetectionInFlight) disposePhoneDetectorWhenIdle = true;
  else disposePhoneDetector();
}

function maybeLoadPhoneDetector() {
  if (!phoneDetectionEnabled || !faceModelReady || phoneDetectionFaulted) return;
  if (phoneDetector) {
    postPhoneDetectionState("ready");
    return;
  }

  const generation = phoneDetectionGeneration;
  postPhoneDetectionState("loading");
  void getPhoneModelLoadPromise().then((detector) => {
    if (generation !== phoneDetectionGeneration || !phoneDetectionEnabled) {
      // A stale load is discarded only if no newer request has re-enabled the
      // detector; the newer request is awaiting the same model promise.
      if (!phoneDetectionEnabled) detector.dispose();
      return;
    }
    phoneDetector = detector;
    phoneDetectionFaulted = false;
    lastPhoneDetectionAt = Number.NEGATIVE_INFINITY;
    postPhoneDetectionState("ready");
  }).catch((error: unknown) => {
    if (generation !== phoneDetectionGeneration || !phoneDetectionEnabled) return;
    failPhoneDetector(generation, error);
  });
}

function setPhoneDetectionEnabled(enabled: boolean) {
  phoneDetectionGeneration += 1;
  phoneDetectionEnabled = enabled;
  phoneDetectionFaulted = false;
  lastPhoneDetectionAt = Number.NEGATIVE_INFINITY;
  if (!enabled) {
    postPhoneDetectionState("off");
    if (phoneDetectionInFlight) disposePhoneDetectorWhenIdle = true;
    else disposePhoneDetector();
    return;
  }

  disposePhoneDetectorWhenIdle = false;
  postPhoneDetectionState("loading");
  maybeLoadPhoneDetector();
}

function phoneImageData(bitmap: ImageBitmap): ImageData | null {
  try {
    phoneCanvas ??= new OffscreenCanvas(PHONE_DETECTION_IMAGE_SIZE, PHONE_DETECTION_IMAGE_SIZE);
    phoneContext ??= phoneCanvas.getContext("2d", { willReadFrequently: true });
    if (!phoneContext) return null;
    phoneContext.drawImage(bitmap, 0, 0, PHONE_DETECTION_IMAGE_SIZE, PHONE_DETECTION_IMAGE_SIZE);
    return phoneContext.getImageData(0, 0, PHONE_DETECTION_IMAGE_SIZE, PHONE_DETECTION_IMAGE_SIZE);
  } catch {
    return null;
  }
}

function detectPhoneInFrame(bitmap: ImageBitmap, timestamp: number) {
  const detector = phoneDetector;
  if (!phoneDetectionEnabled || phoneDetectionFaulted || !detector || phoneDetectionInFlight
    || timestamp - lastPhoneDetectionAt < PHONE_DETECTION_INTERVAL_MS) return;
  const pixels = phoneImageData(bitmap);
  if (!pixels) {
    failPhoneDetector(phoneDetectionGeneration, new Error("The browser could not read pixels from the camera frame."));
    return;
  }

  lastPhoneDetectionAt = timestamp;
  phoneDetectionInFlight = true;
  const generation = phoneDetectionGeneration;
  void detector.detect(pixels, 20, PHONE_DETECTION_MODEL_MIN_SCORE).then((detections: DetectedObject[]) => {
    if (generation !== phoneDetectionGeneration || !phoneDetectionEnabled || detector !== phoneDetector) return;
    const confidence = detections.reduce((best, detection) => (
      detection.class.toLowerCase() === "cell phone" && Number.isFinite(detection.score)
        ? Math.max(best, detection.score)
        : best
    ), 0);
    scope.postMessage({ type: "phone-detection-result", detectedAt: timestamp, confidence });
  }).catch((error: unknown) => {
    failPhoneDetector(generation, error);
  }).finally(() => {
    phoneDetectionInFlight = false;
    if (disposePhoneDetectorWhenIdle && (!phoneDetectionEnabled || phoneDetectionFaulted)) disposePhoneDetector();
  });
}

async function initialize(message: Extract<AttentionWorkerRequest, { type: "init" }>) {
  blockExternalWorkerFetches();
  phoneDetectorModelUrl = message.phoneDetectorModelUrl;
  phoneDetectorWasmBaseUrl = message.phoneDetectorWasmBaseUrl;
  phoneDetectionEnabled = message.phoneDetectionEnabled;
  phoneDetectionFaulted = false;
  phoneDetectionGeneration += 1;
  if (phoneDetectionEnabled) postPhoneDetectionState("loading");

  const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const files = await FilesetResolver.forVisionTasks(message.wasmBaseUrl, true);
  landmarker = await FaceLandmarker.createFromOptions(files, {
    baseOptions: {
      modelAssetPath: message.modelUrl,
      delegate: "CPU",
    },
    runningMode: "VIDEO",
    numFaces: 1,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  });
  faceModelReady = true;
  scope.postMessage({ type: "ready" });
  if (phoneDetectionEnabled) maybeLoadPhoneDetector();
}

function handleFrame(message: Extract<AttentionWorkerRequest, { type: "frame" }>) {
  try {
    if (!landmarker) throw new Error("The face model is not ready yet.");
    const timestamp = Math.max(Math.round(message.timestamp), lastTimestamp + 1);
    lastTimestamp = timestamp;
    const brightness = estimateBrightness(message.bitmap);
    const result = landmarker.detectForVideo(message.bitmap, timestamp);
    scope.postMessage({
      type: "signals",
      frameId: message.frameId,
      signals: extractRawSignals(result, brightness, timestamp),
    });
    // Copy only a small downscaled pixel buffer, then return the camera frame
    // immediately to the caller. Phone inference runs at a lower cadence and
    // never uploads or stores the camera image.
    detectPhoneInFrame(message.bitmap, timestamp);
  } catch (error) {
    scope.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Face inference failed.",
    });
  } finally {
    message.bitmap.close();
  }
}

scope.onmessage = (event) => {
  const message = event.data;
  if (message.type === "dispose") {
    phoneDetectionEnabled = false;
    phoneDetectionGeneration += 1;
    landmarker?.close();
    landmarker = null;
    faceModelReady = false;
    if (!phoneDetectionInFlight) disposePhoneDetector();
    scope.close();
    return;
  }
  if (message.type === "phone-detection") {
    setPhoneDetectionEnabled(message.enabled);
    return;
  }
  if (message.type === "frame") {
    handleFrame(message);
    return;
  }

  void initialize(message).catch((error: unknown) => {
    scope.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Could not initialize the local face model.",
    });
  });
};
