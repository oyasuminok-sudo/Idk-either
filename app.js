import { createFaceSwap, KNOWN_SHA256, probe } from 'browser-inswapper';

// These URLs and checksums match the upstream browser-inswapper demo configuration.
// The InsightFace model weights have separate terms (non-commercial research use).
const HF = 'https://huggingface.co/';
const models = {
  landmarker: {
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    sha256: KNOWN_SHA256.landmarker
  },
  swapperFp16: {
    url: HF + 'facefusion/models-3.0.0/resolve/main/inswapper_128_fp16.onnx',
    sha256: KNOWN_SHA256.swapperFp16
  },
  swapperFp32: {
    url: HF + 'facefusion/models-3.0.0/resolve/main/inswapper_128.onnx',
    sha256: KNOWN_SHA256.swapperFp32
  },
  arcface: {
    url: HF + 'public-data/insightface/resolve/main/models/buffalo_l/w600k_r50.onnx',
    sha256: KNOWN_SHA256.arcface
  },
  segmenter: {
    url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite',
    sha256: KNOWN_SHA256.segmenter
  }
};

const $ = (id) => document.getElementById(id);
const output = $('output');
const original = $('original');
const placeholder = $('cameraPlaceholder');
const cameraState = $('cameraState');
const cameraMessage = $('cameraMessage');
const engineState = $('engineState');
const enginePercent = $('enginePercent');
const modelProgress = $('modelProgress');
const engineIndicator = $('engineIndicator');
const backendName = $('backendName');
const backendDetail = $('backendDetail');
const statsMessage = $('statsMessage');
const engineDiagnostics = $('engineDiagnostics');
let diagnosticLines = [];
const referenceInput = $('referenceInput');
const referencePreview = $('referencePreview');
const uploadPrompt = $('uploadPrompt');
const referenceStatus = $('referenceStatus');
const clearReference = $('clearReference');
const strength = $('strength');
const strengthValue = $('strengthValue');
const startButton = $('startCamera');
const stopButton = $('stopCamera');

let engine = null;
let enginePromise = null;
let cameraStream = null;
let sourceTrack = null;
let processingTrack = null;
let transformedTrack = null;
let referenceUrl = null;
let identityReady = false;
let currentStrength = 1;
let startInProgress = false;

function setEngineStatus(kind, title, detail) {
  engineIndicator.className = `status-ring ${kind || ''}`.trim();
  backendName.textContent = title;
  backendDetail.textContent = detail;
}

function updateProgress({ model, loaded, total }) {
  const max = total || 1;
  modelProgress.max = max;
  modelProgress.value = Math.min(loaded || 0, max);
  const pct = Math.round((modelProgress.value / max) * 100);
  enginePercent.textContent = `${pct}%`;
  engineState.textContent = model ? `Downloading ${model}` : 'Loading AI models';
  cameraMessage.textContent = `Preparing the AI engine: ${model || 'models'} (${Math.round((loaded || 0) / 1e6)} MB downloaded). Keep this tab open.`;
}

async function ensureEngine() {
  if (engine) return engine;
  if (enginePromise) return enginePromise;

  enginePromise = (async () => {
    setEngineStatus('', 'Checking browser support', 'Testing WebGPU, WebNN and CPU support');
    engineState.textContent = 'Checking device support';
    modelProgress.hidden = false;
    modelProgress.value = 0;
    enginePercent.textContent = '0%';

    const caps = await probe();
    const isPhoneLike = matchMedia('(pointer: coarse)').matches;
    if (isPhoneLike && !caps.webgpu.available && !caps.webnn) {
      throw new Error('This browser does not expose WebGPU or WebNN. On phones, the CPU-only fallback may exceed the browser tab memory limit. Try opening this page in an up-to-date Chrome on Android or Safari on iPhone/iPad.');
    }

    cameraMessage.textContent = 'The first model download is about 300 MB. Your photo and camera frames are not uploaded to a FaceShift server.';
    const created = await createFaceSwap({
      models,
      backend: 'auto',
      // On phones, keep MediaPipe landmark tracking off the GPU so it does not
      // compete with ONNX face-swap inference for the same mobile GPU queue.
      tracking: isPhoneLike ? 'CPU' : 'GPU',
      // Occlusion segmentation is optional and adds a second ML model/worker.
      // Disable it for live mobile use so the GPU/CPU budget goes to face tracking and swapping.
      occlusion: false,
      onProgress: updateProgress,
      onStats: ({ fps, inferMs, swapMs, swapsPerSecond, backend, latencyMs }) => {
        statsMessage.textContent = `${backend.toUpperCase()} · ${Math.round(fps)} processed frames/s · ${swapsPerSecond.toFixed(1)} completed swaps/s · ${Math.round(inferMs)} ms inference · ${Math.round(swapMs)} ms full swap · ${Math.round(latencyMs)} ms frame latency`;
        setEngineStatus('ready', `Ready · ${backend.toUpperCase()}`, 'Local inference active');
      },
      onLog: (message) => {
        console.info('[FaceShift AI]', message);
        diagnosticLines.push(message);
        if (diagnosticLines.length > 4) diagnosticLines.shift();
        engineDiagnostics.textContent = diagnosticLines.join(' · ');
      }
    });

    engine = created;
    modelProgress.value = modelProgress.max || 1;
    enginePercent.textContent = '100%';
    engineState.textContent = 'AI engine ready';
    setEngineStatus('ready', `Ready · ${engine.backend.toUpperCase()}`, 'Model loaded in this browser');
    cameraMessage.textContent = 'AI engine ready. Upload your own reference photo and start the camera.';
    return engine;
  })();

  try {
    return await enginePromise;
  } catch (error) {
    enginePromise = null;
    modelProgress.hidden = true;
    engineState.textContent = 'AI engine not ready';
    setEngineStatus('error', 'Could not load AI engine', 'Check connection, browser support and model access');
    throw error;
  }
}

async function decodePhotoFile(file) {
  const errors = [];
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (error) {
      errors.push(error?.message || String(error));
    }
    try {
      // Some Android/WebView decoders reject the EXIF option even when the image itself is valid.
      return await createImageBitmap(file);
    } catch (error) {
      errors.push(error?.message || String(error));
    }

    // A few mobile decoders handle a temporary <img> more reliably than a File/Blob directly.
    const temporaryUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.decoding = 'async';
      image.src = temporaryUrl;
      if (typeof image.decode === 'function') {
        await image.decode();
      } else {
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(new Error('The browser could not decode this image.'));
        });
      }
      return await createImageBitmap(image);
    } catch (error) {
      errors.push(error?.message || String(error));
    } finally {
      URL.revokeObjectURL(temporaryUrl);
    }
  } else {
    throw new Error('This browser does not support the image decoder required by the AI engine. Open FaceShift in a recent version of Chrome.');
  }

  const format = file.type || file.name.split('.').pop()?.toUpperCase() || 'unknown format';
  const detail = errors.filter(Boolean).slice(-2).join(' · ');
  throw new Error(`This photo could not be decoded (${format}). Try exporting it as a standard JPG or PNG. ${detail}`);
}

async function normalizePhoto(file) {
  // Decode and correct EXIF orientation before detection. Downscale the reference
  // before the AI models see it, keeping mobile memory and preprocessing work lower.
  const bitmap = await decodePhotoFile(file);
  try {
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    let canvas;
    let context;
    if ('OffscreenCanvas' in window) {
      canvas = new OffscreenCanvas(width, height);
      context = canvas.getContext('2d');
    } else {
      canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      context = canvas.getContext('2d');
    }
    if (!context) throw new Error('Your browser could not prepare this image.');
    context.drawImage(bitmap, 0, 0, width, height);

    let blob;
    if (canvas.convertToBlob) {
      blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.93 });
    } else {
      blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (value) => value ? resolve(value) : reject(new Error('Could not convert the photo to JPEG.')),
          'image/jpeg',
          0.93
        );
      });
    }
    return URL.createObjectURL(blob);
  } finally {
    bitmap.close?.();
  }
}

async function setReference(file) {
  if (!file) return;
  const looksLikeImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|heic|heif|bmp)$/i.test(file.name);
  if (!looksLikeImage) {
    referenceStatus.textContent = 'Please choose an image file (JPG, PNG or WEBP work best).';
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    referenceStatus.textContent = 'This image is larger than 12 MB. Choose a smaller photo.';
    return;
  }

  referenceStatus.textContent = 'Step 1/4 · Loading the AI engine…';
  referenceInput.disabled = true;
  let nextUrl = null;
  try {
    const ai = await ensureEngine();
    referenceStatus.textContent = 'Step 2/4 · Decoding and preparing the photo…';
    nextUrl = await normalizePhoto(file);
    referenceStatus.textContent = 'Step 3/4 · Detecting a face…';
    const faces = await ai.findFaces(nextUrl);
    if (!faces.length) {
      URL.revokeObjectURL(nextUrl);
      throw new Error('No face was detected. Try a sharper, front-facing photo with even lighting.');
    }

    referenceStatus.textContent = 'Step 4/4 · Applying the reference identity…';
    // findFaces returns the largest face first. This own-face workflow uses that face.
    await ai.setIdentity({ image: nextUrl, face: faces[0] }, { morphMs: 650 });
    ai.setStrength(currentStrength, 400);

    if (referenceUrl) URL.revokeObjectURL(referenceUrl);
    referenceUrl = nextUrl;
    nextUrl = null;
    identityReady = true;
    referencePreview.src = referenceUrl;
    referencePreview.style.display = 'block';
    uploadPrompt.style.display = 'none';
    clearReference.disabled = false;

    const countNote = faces.length > 1 ? ` ${faces.length} faces found; selected the largest.` : '';
    const issueNote = faces[0].issues?.length ? ' Tip: a clearer, evenly lit front-facing photo may improve the result.' : '';
    referenceStatus.textContent = `Reference ready.${countNote}${issueNote}`;
    cameraMessage.textContent = cameraStream ? 'Reference ready. Live transformation is active.' : 'Reference ready. Start the camera to see the live transformation.';
  } catch (error) {
    if (nextUrl) URL.revokeObjectURL(nextUrl);
    console.error('[FaceShift AI] Reference upload failed:', error);
    referenceStatus.textContent = `Upload failed: ${error?.message || String(error)}`;
  } finally {
    referenceInput.disabled = false;
  }
}

async function startCamera() {
  if (startInProgress || cameraStream) return;
  if (!identityReady) {
    cameraMessage.textContent = 'Upload your own reference photo first. The AI engine needs it to create your live identity transformation.';
    referenceInput.focus();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraMessage.textContent = 'Camera access needs a secure context (HTTPS or localhost) and a supported browser.';
    return;
  }
  startInProgress = true;
  startButton.disabled = true;
  cameraMessage.textContent = 'Requesting camera permission…';
  try {
    const phoneLike = matchMedia('(pointer: coarse) and (max-width: 900px)').matches;
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'user' },
        width: { ideal: phoneLike ? 640 : 1280 },
        height: { ideal: phoneLike ? 480 : 720 },
        frameRate: { ideal: 24, max: 30 }
      },
      audio: false
    });
    sourceTrack = cameraStream.getVideoTracks()[0];
    sourceTrack.addEventListener('ended', stopCamera, { once: true });
    original.srcObject = cameraStream;
    original.style.display = 'block';
    output.style.display = 'block';
    placeholder.style.display = 'none';
    await original.play();

    const ai = await ensureEngine();

    // Keep the visible camera preview on the original camera stream. Feed the
    // AI pipeline a 480×360 clone capped at 24 FPS on phones. Chrome's
    // MediaStreamTrackProcessor path processes every incoming frame, so the
    // track constraint—not maxFps—is what controls its workload.
    processingTrack = sourceTrack.clone();
    if (phoneLike) {
      try {
        await processingTrack.applyConstraints({
          width: { ideal: 480, max: 480 },
          height: { ideal: 360, max: 360 },
          frameRate: { ideal: 24, max: 24 }
        });
      } catch (constraintError) {
        console.warn('[FaceShift AI] Could not apply low-power camera constraints:', constraintError);
      }
    }
    transformedTrack = ai.process(processingTrack, { maxFps: 24 });
    if (!transformedTrack) throw new Error('The AI engine did not create an output video track. Try a browser with WebGPU support.');
    output.srcObject = new MediaStream([transformedTrack]);
    await output.play().catch(() => {});
    cameraState.textContent = 'Camera active';
    cameraMessage.textContent = identityReady
      ? 'Live AI transformation is running. The small inset shows the original camera feed.'
      : 'Camera is running. Upload your own reference photo to activate the face transformation.';
    stopButton.disabled = false;
  } catch (error) {
    cameraMessage.textContent = error?.message || 'Could not start the camera.';
    if (processingTrack) processingTrack.stop();
    processingTrack = null;
    if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    sourceTrack = null;
    startButton.disabled = false;
    cameraState.textContent = 'Camera off';
    if (output.srcObject) output.srcObject = null;
    output.style.display = 'none';
    original.srcObject = null;
    original.style.display = 'none';
    placeholder.style.display = 'flex';
  } finally {
    startInProgress = false;
  }
}

function stopCamera() {
  if (transformedTrack) transformedTrack.stop();
  if (processingTrack) processingTrack.stop();
  if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
  transformedTrack = null;
  processingTrack = null;
  cameraStream = null;
  sourceTrack = null;
  output.pause();
  original.pause();
  output.srcObject = null;
  original.srcObject = null;
  output.style.display = 'none';
  original.style.display = 'none';
  placeholder.style.display = 'flex';
  cameraState.textContent = 'Camera off';
  cameraMessage.textContent = engine
    ? (identityReady ? 'Camera stopped. Your AI engine and reference remain loaded in this tab.' : 'Camera stopped. The AI engine remains loaded in this tab.')
    : 'Camera is off.';
  startButton.disabled = false;
  stopButton.disabled = true;
}

referenceInput.addEventListener('change', async () => {
  const file = referenceInput.files?.[0];
  referenceInput.value = '';
  await setReference(file);
});

clearReference.addEventListener('click', () => {
  if (referenceUrl) URL.revokeObjectURL(referenceUrl);
  referenceUrl = null;
  identityReady = false;
  referencePreview.removeAttribute('src');
  referencePreview.style.display = 'none';
  uploadPrompt.style.display = 'block';
  referenceStatus.textContent = 'No reference selected';
  clearReference.disabled = true;
  if (engine) engine.setStrength(0, 350);
  cameraMessage.textContent = cameraStream ? 'Reference removed. Camera preview is still running without transformation.' : 'Reference removed.';
});

strength.addEventListener('input', () => {
  currentStrength = Number(strength.value) / 100;
  strengthValue.value = `${strength.value}%`;
  strengthValue.textContent = `${strength.value}%`;
  if (engine && identityReady) engine.setStrength(currentStrength, 200);
});

startButton.addEventListener('click', startCamera);
stopButton.addEventListener('click', stopCamera);
window.addEventListener('pagehide', stopCamera);


// Progressive Web App: cache the application shell for repeat visits.
// The AI model files are cached separately by browser-inswapper.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
      .catch((error) => console.warn('[FaceShift AI] Service worker registration failed:', error));
  });
}
