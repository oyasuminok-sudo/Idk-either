# FaceShift AI — Browser app 0.3.0

A browser-only, local-first live face transformation app, configured for use with the user's own reference photo.

## Included

- Camera capture through `getUserMedia`.
- Reference photo upload, orientation normalization, mobile-friendly downscaling and face detection.
- Local identity extraction and live transformed `MediaStreamTrack` output using `browser-inswapper`.
- Expression/head-pose tracking and face blending provided by the inference library.
- Transformation-strength control, original-camera inset, model-download progress, performance status and stop controls.
- PWA manifest and service worker for installing the app shell on supported mobile browsers.
- GitHub Actions workflow to build and publish the site to GitHub Pages.

Camera frames and the reference photo are not sent to a FaceShift backend. Model files are downloaded from their providers and cached by the inference library.

## Open the hosted app

After the GitHub Pages workflow has completed, open:

`https://oyasuminok-sudo.github.io/Idk-either/`

If Pages has not been configured yet, open repository **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**, and save. Then run the **Deploy FaceShift AI to GitHub Pages** workflow from the Actions tab.

On Android, open the HTTPS site in a recent Chrome browser, allow camera permission, upload your own clear front-facing photo, wait for the model download to finish, then start the live transformation. You can use the browser menu's **Add to Home screen** option to install the PWA shell.

## Run locally

Requirements: Node.js 22.6 or newer and npm.

```bash
npm install
npm run dev
```

Open the localhost URL printed by Vite. Camera access requires HTTPS or localhost.

Production build:

```bash
npm run build
npm run preview
```

## First run and device support

The first use downloads approximately 300 MB of AI models. Use Wi-Fi and keep the tab open until the models finish loading. Later visits can reuse the browser model cache.

Performance depends heavily on the phone, browser and GPU. The app prefers WebGPU/WebNN where available. On phones without either API, it refuses to start the CPU-only path because that can be extremely slow or exceed the browser tab's memory limit. Large reference images are downscaled before processing to reduce memory use.

The current version is not guaranteed to run on every Android device. It still needs real-device testing on the target phone and browser.

## Model and software licensing

This project integrates `browser-inswapper` (PolyForm Noncommercial 1.0.0). The InsightFace model weights are separately licensed for non-commercial research use; those weights are not relicensed by this project. MediaPipe models are Apache-2.0. Review upstream terms before redistributing or using this beyond personal experimentation.

The project does not bundle model weights. It fetches them from upstream locations configured in `app.js` and verifies SHA-256 hashes using the library's `KNOWN_SHA256` constants.

Upstream:
- https://github.com/robert-schmidt/browser-inswapper
- https://robert-schmidt.github.io/browser-inswapper/

## Responsible use and privacy

Use your own likeness or a reference image you have explicit permission to use. The preview is labelled as AI-transformed; keep that disclosure when recording or sharing altered footage. Camera frames and reference photos remain in the browser and are not uploaded to a FaceShift server. Model files are fetched from their providers.

## Limitations

- The site must be served from HTTPS or localhost; opening `index.html` directly will not enable camera access.
- The transformed output is available in the browser tab as a video stream. A system-wide virtual camera for other calling apps is not included.
- The app selects the largest detected face in the reference photo. Use a single-face image.
- GitHub Pages does not provide custom COOP/COEP headers. GPU inference is expected to be the practical route there; multi-threaded WASM may not be available.
- No physical webcam/GPU test was possible in the code-editing environment.
