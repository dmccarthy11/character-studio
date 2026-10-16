# Verification of local edition v0.2.0

## Generation status clarity — October 15, 2026

- Runway video submissions now distinguish explicit client HTTP rejections from uncertain submission outcomes. Rejections save `videoRejection` and clear only the pending submission flag, allowing a user-requested resume after fixing account/input issues; lost responses, missing task IDs and server errors remain blocked. FFmpeg/provider fixtures passed for HTTP 400 recovery and no duplicate submissions after network/HTTP 500 failures. The production shot-2 flag left by the earlier observed HTTP 400 was backed up as `checkpoint-before-http400-recovery-*.json`, then cleared and the same saved job resumed after confirming the 5,005-credit balance; shot 1 and all audio/frames were preserved.
- Added Settings → Provider balances & usage with explicit read-only Runway/ElevenLabs checks, unavailable/permission states, and manual OpenAI/Sync billing links. Keys and raw provider responses remain server-side. Fixture tests cover remaining allowance, missing keys, permission failures, malformed responses, network failures and secret redaction (`node tests/provider-balances.test.mjs`). TypeScript/build passed; isolated browser checks verified displayed balances and foreign-Origin rejection. Live read-only checks reported 5 Runway credits and HTTP 401 for ElevenLabs subscription access; no generation was submitted or recovery checkpoint changed.
- Read-only inspection of Sarah's “Sunny Fall Walk to a New Cafe” found an AUDIO_READY script with no speech segments and two completed, zero-cost AUDIO jobs. It was waiting for starting-frame preparation, not a voice response.
- Added a current-video status card, production steps, explicit no-speech guidance, frame-review navigation, worker-update age and cautious stale-update messaging. Removed misleading voice-validation instructions for scripts without speech and redundant preview generation controls after audio is ready.
- Status polling continues after a temporary fetch failure.
- Frame preparation now shows immediate submission feedback, a spinning button, saved-frame count, stage progress and generating/queued placeholders beside the frame controls. Disposable browser checks verified the disabled loading button and a partially completed four-frame job; screenshots are under `.review/frame-loading-*.png`. The user's active frame job was monitored read-only and continued saving images during the UI change.
- TypeScript and isolated production build passed. Headless Edge checks against disposable data passed for Sarah's no-speech state, voice-ready controls, stale running jobs, next-step navigation, polling recovery and a 390px viewport without horizontal overflow or runtime exceptions. Desktop/mobile screenshots are under `.review/generation-status-*.png`.
- No paid provider requests or changes to production records, credentials, media or checkpoints. The fixture did not copy original media, so character portraits in its screenshots are unavailable.

## Realism rework — October 12, 2026

Branch: `rework/realistic-influencer-studio`.

- Windows TypeScript check and isolated production build passed.
- Existing disposable SQLite/API and FFmpeg/provider-fixture suites passed.
- Added API tests for quiet posts, mock frame generation/review, visual-edit approval invalidation, pre-animation frame enforcement and cumulative media-budget rejection.
- Added actual FFmpeg/provider fixtures for high-quality image requests, saved frame resume, silent exports without TTS, Gen-4.5 request shape, unchanged raw reuse, per-shot motion retakes, cumulative worker budget enforcement and unknown image submission protection.
- Completed one **live** identity-reference image with GPT Image 2 and a five-second **live** Gen-4.5 video, with a local export. Artifacts are under `.review/quality-pilot/`, excluded from Git. The pilot reads the existing character snapshot and writes separately from the user's data. It contains no speech or lip-sync stage.
- Inspected the live starting image and sampled video frames. The image has more visible skin detail and neutral lighting than the sampled previous export; sampled motion frames retain the face through a head turn. This is a limited visual inspection, not a blinded realism study, full-motion playback assessment or multi-video identity benchmark. A phone appeared despite not being needed by the pilot action; subsequent frame prompts make phone guidance conditional and restrict props to the action. That prompt refinement has not been re-benchmarked with another paid image.
- Initial live image connection attempts failed; explicit isolated-pilot retry checkpoints were preserved. The successful request and video used existing credentials. No production database, existing media, original checkpoints or `.env` changes were made.
- Headless Edge initially timed out inside the sandbox, then passed outside it against a disposable mock database with blank provider keys. Verified frame-review rendering, a persisted frame-approval click, no runtime exceptions and no horizontal overflow at a 390px mobile viewport. Desktop/mobile screenshots were inspected and saved under `.review/`. The fixture's canonical-reference URL had no copied media in that disposable database; the generated sample-frame controls rendered correctly. The test server and browser were closed.

Commands: `npm run typecheck`, `npm run test:local`, `npm run test:media`, and `npm run build` with `NEXT_DIST_DIR=.next-build-check`. Paid benchmark commands and the production acceptance checklist are in [REALISM-WORKFLOW.md](REALISM-WORKFLOW.md).

## Flexible UGC update — October 7, 2026

Verified natively on Windows with Node.js 24.14.0 and the installed FFmpeg/FFprobe:

- TypeScript check and Next.js production build.
- Isolated SQLite/HTTP mock workflow including separate script and voice approval gates.
- Variable shot counts/durations, shared speech across adjacent shots, edit invalidation and duplicate-job protection.
- Validated source-video/music uploads, persisted mix controls and origin rejection.
- Actual FFmpeg exports with continuous speech across cuts, normalized timestamps, frame-aligned cuts, caption timing and sound mixing.
- Nonempty silent/implausibly short audio rejection, validation of cached speech on resume and final spoken-interval audio checks.
- Safe download GET retries, expired-link refresh and redacted network errors using fixture responses.
- Mocked image, Runway and Sync submission/polling/download paths; no duplicate paid calls on resume or unchanged-footage rebuild.
- One bounded retry after a completed defective speech response; ambiguous speech submissions remain blocked from automatic resubmission.

Commands: `npm run typecheck`, `npm run build`, `npm run test:local`, `npm run test:media`.
Tests use temporary media/SQLite folders and fake provider responses. The user's `.env`, database, saved media and paid generations were not changed. No live generation requests were made. Browser interaction/visual testing and real provider realism/lip-sync evaluation remain unverified.

Read-only diagnosis of the existing completed job: second voice take is 0.36 seconds at -55.5 dB peak, with effectively silent assembled audio. Third voice take is 6.6 seconds and the old edit cuts it to four seconds. The upstream reason for the defective second speech response is still unknown.

## Reusable character voice verification — October 7, 2026

- Validated audio upload, audible-duration limits, corruption rejection, local playback and cross-origin isolation in a disposable SQLite workspace.
- Successful ElevenLabs clone response persistence, verification notification, duplicate and uncertain-submission protection, HTTP rejection retry, and existing-voice connection with intercepted fixture responses.
- Character profile edits preserve uploaded samples and reusable voice IDs. New concepts inherit voice/speed settings; applying changes to a current script clears cached speech and audio approval and rejects active jobs.
- Worker fixtures reuse the same cloned voice across preview jobs, pass speaking speed, hash the effective voice/model, preserve old OpenAI hash compatibility and enforce the separate ElevenLabs cost estimate.
- TypeScript, an isolated production build, isolated API integration tests and FFmpeg/media/provider fixtures pass. No real voice cloning or paid speech/video calls were made; the user's credentials, database and existing media were preserved. Live clone fidelity and browser interaction remain unverified.

## Network download recovery verification — October 7, 2026

- Read-only inspection found the latest actual failure at **Starting frame 7**, with shots 1–6 already saved and a pending image submission. The user's database, media and checkpoints were not modified.
- Fixtures verify connection resets before headers and during JSON/MP4 body reads, bounded status/download retries, expired-link refresh, continuing with the prior URL after a failed refresh, system-downloader fallback, access failures, certificate failures, temporary-file cleanup and redacted errors.
- Worker fixtures inject Runway/Sync status failures and interrupted video downloads while asserting unchanged image/video/lip-sync submission counts across retry, resume and rebuild.
- Isolated API tests verify saved-starting-image imports, corrupt-image rejection and refusal to overwrite existing frames/clips. Worker fixtures verify ambiguous image submissions stay blocked until a saved image is imported, then continue without a new image request.
- Recovery inspection identifies the blocked shot even after a resumed job changes its stage label. Explicit per-shot image retry requires acceptance of a possible additional charge, preserves the original checkpoint backup and existing media, and queues the existing job. API fixtures verify authorization/duplicate guards and actionable normal-resume errors; worker fixtures verify only the missing shot's image/video requests are made while completed footage and lip-sync outputs remain unchanged.
- TypeScript and isolated API/media tests pass. The installed Windows curl executable reports Schannel TLS support. System fallback success was tested with an injected downloader; no live paid provider calls or CDN downloads were made.

## Original edition verification

Verified on Node.js 24.19.0 in Linux:
- npm dependency installation and TypeScript check.
- Standard Next.js production build.
- npm run dev starts the loopback server and local worker.
- Full mock workflow through local HTTP endpoints.
- SQLite persistence across process shutdown and restart with npm start.
- Reference upload, byte-range delivery, MP4 playback endpoint.
- Rejection of foreign Origin/Host headers and unauthenticated worker requests.
- Backup includes saved database records and uploaded reference bytes.

The Windows launcher and cross-platform paths were reviewed, but a native Windows machine was not available for execution. Real provider API calls were not made. Paid job checkpoint/recovery code has not been tested against live providers.

Sync billing rejection recovery (October 7, 2026):
- Lip-sync HTTP 402 now records a definitive billing/plan rejection and clears only that submission marker. Resume retains the same idempotency key, saved footage and completed lip-sync outputs.
- Network failures and successful responses without a task ID retain the ambiguous-submission protection. Errors identify the affected shot.
- Fixture media tests cover 402 rejection followed by a successful resume, unchanged saved footage, stable idempotency keys, and blocked duplicate submissions after lost responses/missing IDs. Typecheck and media tests passed; no live provider calls were made.
- The existing failed job 02574ed8-7cd1-466d-a79c-21ef536be61b had its shot-sc7 lipSubmitting marker repaired based on the previously reported HTTP 402 at shot 7. The original checkpoint was backed up alongside it as checkpoint-before-sync-402-recovery-*.json. Other checkpoint entries, media, credentials and SQLite were preserved; the job remains failed until the user resumes it.
