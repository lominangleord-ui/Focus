# Attention Guard bundled model and runtime notices

The following assets are distributed locally with Focus Draft.

## MediaPipe face landmark model

- `face_landmarker.task` — copied from `@beautinique/frontend-tryon-assets@1.0.2`, `models/face_landmarker.task`. That package's `NOTICE.md` identifies the model as Google's MediaPipe model, copied as downloaded and distributed under Apache License 2.0. SHA-256: `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`.
- `wasm/vision_wasm_module_internal.js` and `wasm/vision_wasm_module_internal.wasm` — copied from `@mediapipe/tasks-vision@1.2.2` for the module worker.

Copyright Google LLC. These model/runtime assets are licensed under the Apache License, Version 2.0. The full license text is in `LICENSE-MediaPipe.txt`.

## Optional visible-phone detector

- `phone-detector/model.json` and its `group1-shard*` weights are the TensorFlow.js COCO-SSD MobileNetV1 object detector files distributed in `node-red-contrib-tfjs-coco-ssd@1.0.6` (source: `https://github.com/dceejay/tfjs-coco-ssd`). Its README identifies the COCO `cell phone` class and links to the TensorFlow.js COCO-SSD project. The package declares Apache-2.0; see `LICENSE-COCO-SSD.txt`. The package does not separately document the original training-weight provenance.
- `phone-detector/wasm/tfjs-backend-wasm*.wasm` is copied from `@tensorflow/tfjs-backend-wasm@4.22.0`, which declares Apache-2.0; see `LICENSE-COCO-SSD.txt`.

The TensorFlow.js inference SDKs are build-time dependencies bundled into the local module worker. Attention Guard does not load model weights or inference runtimes from a CDN. Phone frames are processed locally in the optional Focus-only detector; no camera frame, object bounding box, or raw numeric result is stored or sent to a server.
