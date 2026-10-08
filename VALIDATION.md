# Verification of local edition v0.2.0

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
