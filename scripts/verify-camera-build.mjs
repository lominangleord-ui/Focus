import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";

const requiredFiles = [
  "dist/index.html",
  "dist/attention-guard/worker.js",
  "dist/attention-guard/face_landmarker.task",
  "dist/attention-guard/wasm/vision_wasm_module_internal.js",
  "dist/attention-guard/wasm/vision_wasm_module_internal.wasm",
  "dist/attention-guard/phone-detector/model.json",
  "dist/attention-guard/phone-detector/group1-shard1of5",
  "dist/attention-guard/phone-detector/group1-shard2of5",
  "dist/attention-guard/phone-detector/group1-shard3of5",
  "dist/attention-guard/phone-detector/group1-shard4of5",
  "dist/attention-guard/phone-detector/group1-shard5of5",
  "dist/attention-guard/phone-detector/wasm/tfjs-backend-wasm.wasm",
  "dist/attention-guard/phone-detector/wasm/tfjs-backend-wasm-simd.wasm",
  "dist/attention-guard/NOTICE.md",
  "dist/attention-guard/LICENSE-MediaPipe.txt",
  "dist/attention-guard/LICENSE-COCO-SSD.txt",
];

for (const file of requiredFiles) {
  try {
    await access(file, constants.R_OK);
    const { size } = await stat(file);
    if (size === 0) throw new Error("file is empty");
  } catch (error) {
    throw new Error(
      `Attention Guard deployment asset is missing or empty: ${file}. ` +
      "Build both Vite targets and publish the dist directory (Vercel: npm run build, output dist).",
      { cause: error },
    );
  }
}

console.log("Attention Guard deployment assets verified.");
