// Runs in a worker thread (see decodeHeicToJpeg in media.ts): the wasm HEIC decode is CPU heavy and
// must not block the server's single event loop. Plain .mjs so it needs no bundling.
import { parentPort, workerData } from "node:worker_threads";
import convert from "heic-convert";

try {
  const out = await convert({ buffer: new Uint8Array(workerData.buffer), format: "JPEG", quality: 0.9 });
  const bytes = new Uint8Array(out);
  parentPort.postMessage({ ok: true, buffer: bytes.buffer }, [bytes.buffer]);
} catch (e) {
  parentPort.postMessage({ ok: false, message: String(e && e.message) });
}
