import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = resolve(root, 'node_modules/browser-inswapper/src');

const edits = {
  'backend.ts': [
    [
`export function sessionOptions(backend: Backend, c: Capabilities) {
  // 'all' fuses Conv+activation into FusedConv, which WebGPU only has in fp32: GPUs get the safe 'basic' level.
  // No CPU memory arena: it keeps the largest buffers ever used reserved, which on a phone is memory the tab dies for.
  const base = { graphOptimizationLevel: backend === 'wasm' ? 'all' as const : 'basic' as const, enableCpuMemArena: false };
  // NHWC measured 2× faster than NCHW on Apple M-series. ponytail: graph capture gains ~18% more, needs GPU-buffer IO.
  if (backend === 'webgpu') return { ...base, executionProviders: [{ name: 'webgpu' as const, preferredLayout: 'NHWC' as const }] };
`,
`export function sessionOptions(backend: Backend, c: Capabilities, preferredLayout: 'NHWC' | 'NCHW' = 'NHWC', graphCapture = false) {
  // 'all' fuses Conv+activation into FusedConv, which WebGPU only has in fp32: GPUs get the safe 'basic' level.
  // No CPU memory arena: it keeps the largest buffers ever used reserved, which on a phone is memory the tab dies for.
  const base = { graphOptimizationLevel: backend === 'wasm' ? 'all' as const : 'basic' as const, enableCpuMemArena: false };
  // Layout can vary by GPU. The startup benchmark compares NHWC and NCHW instead of assuming one is fastest.
  // Graph capture is attempted for fixed-shape WebGPU inference and safely disabled if the model/runtime rejects it.
  if (backend === 'webgpu') return { ...base, enableGraphCapture: graphCapture, executionProviders: [{ name: 'webgpu' as const, preferredLayout }] };
`
    ]
  ],
  'index.ts': [
    [
`  const swapSpec = (fp === 'fp16' ? opts.models.swapperFp16 : opts.models.swapperFp32) ?? opts.models.swapperFp32 ?? opts.models.swapperFp16;
  if (!swapSpec) throw new Error('models.swapperFp16 or models.swapperFp32 is required.');
`,
`  const swapSpec = (fp === 'fp16' ? opts.models.swapperFp16 : opts.models.swapperFp32) ?? opts.models.swapperFp32 ?? opts.models.swapperFp16;
  if (!swapSpec) throw new Error('models.swapperFp16 or models.swapperFp32 is required.');
  const selectedPrecision = swapSpec === opts.models.swapperFp16 ? 'fp16' : 'fp32';
  opts.onLog?.('Swapper model: ' + selectedPrecision.toUpperCase() + ' · WebGPU shader-f16: ' + (caps.webgpu.f16 ? 'available' : 'unavailable'));
  opts.onLog?.('WebGPU adapter: ' + ([caps.webgpu.vendor, caps.webgpu.architecture].filter(Boolean).join(' ') || 'details hidden by browser'));
`
    ],
    [
`export type Stats = { fps: number; inferMs: number; backend: Backend; latencyMs: number };
`,
`export type Stats = { fps: number; inferMs: number; swapMs: number; swapsPerSecond: number; backend: Backend; latencyMs: number };
`
    ],
    [
`          const b0 = boxOf(coarse.lm, W, H), side = 2 * Math.max(b0.width, b0.height);
          const sx = b0.x + b0.width / 2 - side / 2, sy = b0.y + b0.height / 2 - side / 2;
          const crop = await createImageBitmap(bitmap, sx, sy, side, side, { resizeWidth: 512, resizeHeight: 512 });
`,
`          const b0 = boxOf(coarse.lm, W, H);
          // Keep detector refinement crops inside the source bitmap. Mobile photos can
          // put the face close to an edge, where a negative crop origin makes decoding fail.
          const side = Math.max(1, Math.min(2 * Math.max(b0.width, b0.height), W, H));
          const centerX = Math.max(side / 2, Math.min(W - side / 2, b0.x + b0.width / 2));
          const centerY = Math.max(side / 2, Math.min(H - side / 2, b0.y + b0.height / 2));
          const sx = centerX - side / 2, sy = centerY - side / 2;
          const crop = await createImageBitmap(bitmap, sx, sy, side, side, { resizeWidth: 512, resizeHeight: 512 });
`
    ],
    [
`          const ps = 1.5 * Math.max(box.width, box.height);
          const preview = await createImageBitmap(bitmap, box.x + box.width / 2 - ps / 2, box.y + box.height / 2 - ps / 2, ps, ps, { resizeWidth: 160, resizeHeight: 160, resizeQuality: 'high' });
`,
`          const wantedPreviewSide = 1.5 * Math.max(box.width, box.height);
          const previewSide = Math.max(1, Math.min(wantedPreviewSide, W, H));
          const previewX = Math.max(previewSide / 2, Math.min(W - previewSide / 2, box.x + box.width / 2));
          const previewY = Math.max(previewSide / 2, Math.min(H - previewSide / 2, box.y + box.height / 2));
          const preview = await createImageBitmap(bitmap, previewX - previewSide / 2, previewY - previewSide / 2, previewSide, previewSide, { resizeWidth: 160, resizeHeight: 160, resizeQuality: 'high' });
`
    ]
  ],
  'protocol.ts': [
    [
`  | { type: 'stats'; fps: number; inferMs: number; backend: Backend }
`,
`  | { type: 'stats'; fps: number; inferMs: number; swapMs: number; swapsPerSecond: number; backend: Backend }
`
    ]
  ],
  'worker.ts': [
    [
`type Runner = { run(target: Float32Array, source: Float32Array): Promise<Float32Array>; release(): Promise<void> };
`,
`type Runner = { run(target: Float32Array, source: Float32Array): Promise<Float32Array>; release(): Promise<void>; warmed: boolean };
`
    ],
    [
`const timings: number[] = [];
let frames = 0, lastStats = 0;
`,
`const timings: number[] = []; // complete swap work: inference plus CPU preparation and compositing
const inferenceTimings: number[] = []; // time spent waiting for the ONNX session run
let frames = 0, lastStats = 0, swapsCompleted = 0;
`
    ],
    [
`async function plainRunner(bytes: ArrayBuffer, b: Backend): Promise<Runner> {
  const s = await ort.InferenceSession.create(new Uint8Array(bytes), sessionOptions(b, caps));
  return {
    run: async (target, source) => (await s.run({ target: new ort.Tensor('float32', target, [1, 3, SIZE, SIZE]), source: new ort.Tensor('float32', source, [1, 512]) })).output.data as Float32Array,
    release: () => s.release(),
  };
}

async function createSwapper(bytes: ArrayBuffer, order: Backend[]) {
  let best: { s: Runner; b: Backend; ms: number } | null = null;
  const target = new Float32Array(3 * SIZE * SIZE).fill(0.5), source = new Float32Array(512).fill(0.04);
  for (const b of order) {
    if (b === 'wasm' && best) break; // a working GPU always beats the CPU for this model
    try {
      let t = performance.now();
      const s = await plainRunner(bytes, b);
      await s.run(target, source); // first run compiles shaders
      post({ type: 'log', message: \`\${b}: ready in \${Math.round(performance.now() - t)} ms\` });
      t = performance.now();
      for (let i = 0; i < 5; i++) await s.run(target, source);
      const ms = (performance.now() - t) / 5;
      post({ type: 'log', message: \`\${b}: \${ms.toFixed(1)} ms per swap\` });
      if (!best || ms < best.ms) { await best?.s.release(); best = { s, b, ms }; } else await s.release();
    } catch (err) {
      post({ type: 'log', message: \`\${b} unavailable: \${err instanceof Error ? err.message : err}\` });
    }
  }
  if (!best) throw new Error('No way to run the face model on this device.');
  return best;
}
`,
`async function plainRunner(bytes: ArrayBuffer, b: Backend, layout: 'NHWC' | 'NCHW' = 'NHWC'): Promise<Runner> {
  const makeSession = (graphCapture: boolean) =>
    ort.InferenceSession.create(new Uint8Array(bytes), sessionOptions(b, caps, layout, graphCapture));
  const feeds = (target: Float32Array, source: Float32Array) => ({
    target: new ort.Tensor('float32', target, [1, 3, SIZE, SIZE]),
    source: new ort.Tensor('float32', source, [1, 512])
  });
  let session: ort.InferenceSession;
  let warmed = false;

  if (b === 'webgpu') {
    let capturedSession: ort.InferenceSession | null = null;
    try {
      // The swap network always receives fixed [1,3,128,128] and [1,512] inputs,
      // so it is a candidate for WebGPU graph capture.
      capturedSession = await makeSession(true);
      await capturedSession.run(feeds(
        new Float32Array(3 * SIZE * SIZE).fill(0.5),
        new Float32Array(512).fill(0.04)
      ));
      session = capturedSession;
      warmed = true;
      post({ type: 'log', message: 'WebGPU/' + layout + ': graph capture enabled' });
    } catch (error) {
      if (capturedSession) await capturedSession.release().catch(() => {});
      const reason = error instanceof Error ? error.message : String(error);
      post({ type: 'log', message: 'WebGPU/' + layout + ': graph capture unavailable; retrying without it (' + reason + ')' });
      session = await makeSession(false);
    }
  } else {
    session = await makeSession(false);
  }

  return {
    warmed,
    run: async (target, source) => (await session.run(feeds(target, source))).output.data as Float32Array,
    release: () => session.release(),
  };
}

async function createSwapper(bytes: ArrayBuffer, order: Backend[]) {
  let best: { s: Runner; b: Backend; layout: string; ms: number } | null = null;
  const target = new Float32Array(3 * SIZE * SIZE).fill(0.5), source = new Float32Array(512).fill(0.04);
  for (const b of order) {
    if (b === 'wasm' && best) break; // retain the library's GPU-first CPU fallback policy
    const layouts: ('NHWC' | 'NCHW')[] = b === 'webgpu' ? ['NHWC', 'NCHW'] : ['NHWC'];
    for (const layout of layouts) {
      let runner: Runner | null = null;
      try {
        const started = performance.now();
        runner = await plainRunner(bytes, b, layout);
        if (!runner.warmed) await runner.run(target, source);
        const samples: number[] = [];
        // Three warmed runs are enough to compare layouts without adding a long startup delay.
        for (let i = 0; i < 3; i++) {
          const t = performance.now();
          await runner.run(target, source);
          samples.push(performance.now() - t);
        }
        samples.sort((a, b) => a - b);
        const ms = samples[1];
        post({ type: 'log', message: b.toUpperCase() + '/' + layout + ': ' + ms.toFixed(1) + ' ms per inference (benchmark setup ' + Math.round(performance.now() - started) + ' ms)' });
        if (!best || ms < best.ms) {
          await best?.s.release();
          best = { s: runner, b, layout, ms };
          runner = null;
        }
      } catch (err) {
        post({ type: 'log', message: b.toUpperCase() + '/' + layout + ' unavailable: ' + (err instanceof Error ? err.message : err) });
      } finally {
        if (runner) await runner.release().catch(() => {});
      }
    }
  }
  if (!best) throw new Error('No way to run the face model on this device.');
  post({ type: 'log', message: 'Selected ' + best.b.toUpperCase() + '/' + best.layout + ': ' + best.ms.toFixed(1) + ' ms per inference' });
  return best;
}
`
    ],
    [
`  const t0 = performance.now();
  const o = await exclusive(() => swapper!.run(toFloats(original, 0, 255), latent));
  const n = SIZE * SIZE, src = original.data;
`,
`  const t0 = performance.now();
  const inferenceStart = performance.now();
  const o = await exclusive(() => swapper!.run(toFloats(original, 0, 255), latent));
  inferenceTimings.push(performance.now() - inferenceStart);
  if (inferenceTimings.length > 30) inferenceTimings.shift();
  const n = SIZE * SIZE, src = original.data;
`
    ],
    [
`  faceCtx.putImageData(image, 0, 0);
  compositor.setFace(face, uv);
}
`,
`  faceCtx.putImageData(image, 0, 0);
  compositor.setFace(face, uv);
  swapsCompleted++;
}
`
    ],
    [
`  if (now - lastStats > 1000) {
    post({ type: 'stats', fps: (frames * 1000) / (now - lastStats || 1), inferMs: timings.length ? timings.reduce((a, b) => a + b, 0) / timings.length : 0, backend });
    frames = 0; lastStats = now;
  }
`,
`  if (now - lastStats > 1000) {
    const intervalMs = now - lastStats || 1;
    post({
      type: 'stats',
      fps: (frames * 1000) / intervalMs,
      inferMs: inferenceTimings.length ? inferenceTimings.reduce((a, b) => a + b, 0) / inferenceTimings.length : 0,
      swapMs: timings.length ? timings.reduce((a, b) => a + b, 0) / timings.length : 0,
      swapsPerSecond: (swapsCompleted * 1000) / intervalMs,
      backend
    });
    frames = 0;
    swapsCompleted = 0;
    lastStats = now;
  }
`
    ]
  ]
};

function replaceExactlyOnce(source, before, after, file) {
  const count = source.split(before).length - 1;
  if (count === 0 && source.includes(after)) return source;
  if (count !== 1) {
    throw new Error(`Expected one match in ${file}, found ${count}. Refusing to apply an uncertain source patch.`);
  }
  return source.replace(before, after);
}

for (const [file, replacements] of Object.entries(edits)) {
  const path = resolve(sourceDir, file);
  let source = await readFile(path, 'utf8');
  for (const [before, after] of replacements) source = replaceExactlyOnce(source, before, after, file);
  await writeFile(path, source);
}

console.log('Applied FaceShift mobile inference tuning to browser-inswapper.');
