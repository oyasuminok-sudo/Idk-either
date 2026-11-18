# FaceShift AI — Browser build 0.2.0

A browser-only, local-first live face transformation prototype, configured for the user's own reference photo.

## What's implemented

- Camera capture using `getUserMedia`.
- Reference photo upload, orientation normalization and face detection.
- Live identity extraction from the selected photo.
- Live transformed `MediaStreamTrack` output using `browser-inswapper`.
- Expression/head-pose tracking and face blending provided by the inference library.
- Strength slider, original-camera inset, model-download progress, backend/performance status and stop controls.
- Browser-side inference. Camera frames and the reference photo are not sent to a FaceShift backend.

## Run locally

Requirements: Node.js 22.6 or newer and npm.

```bash
npm install
npm run dev
```

Open the localhost URL printed by Vite. Camera access requires HTTPS or localhost. Use a recent Chrome or Edge on desktop for WebGPU; recent Safari/Chrome mobile may work when WebGPU is enabled and has sufficient memory. Upload your own reference photo first; the app loads the AI engine and creates the identity embedding before enabling live transformation.

To make a production build:

```bash
npm run build
npm run preview
```

## First run and performance

The first use downloads approximately 300 MB of AI models, then the browser caches them. The download begins when you upload a reference photo. Use Wi-Fi. Performance depends heavily on the browser and GPU. CPU-only inference may be too slow for live use; on phones, a browser without WebGPU/WebNN can exceed the tab's memory limit and is deliberately rejected by the app.

## Model and software licensing

This project integrates `browser-inswapper` (PolyForm Noncommercial 1.0.0). The model weights are separately licensed by InsightFace for non-commercial research use; those weights are not relicensed by this project. MediaPipe models are Apache-2.0. Review all upstream terms before redistributing or using this beyond personal experimentation. This build does not include model weights; it fetches them from the upstream locations configured in `app.js`, and checks SHA-256 values using the library's `KNOWN_SHA256` constants.

Upstream implementation and model configuration:
- https://github.com/robert-schmidt/browser-inswapper
- https://robert-schmidt.github.io/browser-inswapper/

## Responsible use

Use your own likeness or a reference image you have explicit permission to use. Keep the AI-altered notice visible when recording or sharing transformed output. The page does not upload video or reference images to a FaceShift server; model files are downloaded from their providers.

## Limitations in this milestone

- This is a browser app, not a hosted public website. It must be served from localhost or HTTPS.
- The transformed preview is live in the browser tab; direct virtual-camera integration with calling apps is not implemented.
- This app automatically selects the largest face in the reference photo. Use a single-face image for best results.
- No runtime test against a physical webcam/GPU could be performed in this container.
