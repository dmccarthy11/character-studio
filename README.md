# Character Studio Local — Windows edition

A standalone, single-user edition of Character Studio. Runs on your Windows PC at **http://localhost:3000** with a local SQLite database and local media folders. No ChatGPT account, Supabase account, PostgreSQL server, Docker, or cloud hosting is needed.

## Start on Windows

1. Install **Node.js 24 or newer** from https://nodejs.org/ (the Windows installer includes npm).
2. Extract this ZIP to a writable folder, such as `C:\Projects\character-studio-local`. Do not run it from inside the ZIP.
3. Double-click **Start-Character-Studio.cmd**. It installs dependencies on first use and starts the server and background worker.
4. Open **http://localhost:3000**. Keep the terminal window open. Press **Ctrl+C** to stop.

Or, in Command Prompt / PowerShell:

```powershell
cd C:\Projects\character-studio-local
npm install
npm run dev
```

If PowerShell blocks npm.ps1, use `npm.cmd install` and `npm.cmd run dev`, or use the included .cmd launcher. The first installation needs Internet access. After installation, mock mode runs locally without Internet.

For a production build on your own machine:

```powershell
npm run build
npm start
```

Both dev and start bind only to **127.0.0.1** and start the worker automatically. If port 3000 is busy, change PORT in `.env` and restart. Open the matching localhost port. Only run one app instance per data folder.

## Storage

The app automatically creates:

```text
data/
  studio.sqlite           Characters, products, scripts, memories, jobs and history
  studio.sqlite-wal       SQLite journal while the database is in use
  studio.sqlite-shm       SQLite shared-memory file while in use
  media/                  Uploaded references and completed video/caption files
  jobs/                   Durable intermediate clips, audio and recovery checkpoints
  .worker-token           Local worker authentication secret, generated automatically
```

Videos and audio are normal files, not giant blobs inside SQLite. The database should usually be much smaller than the media folders. There is no 100 GB application storage quota; actual disk capacity is the limit. Intermediate files are intentionally retained and can consume substantial space. Never delete job checkpoints while a job is active or resumable.

`DATA_DIR=./data` in `.env` controls the location. To relocate it, stop the app, copy the entire data directory to the new location, change DATA_DIR, then start again. On Windows, use an absolute path with forward slashes such as `D:/CharacterStudioData` if convenient. Pointing at an empty location creates a fresh workspace; it does not move old files automatically.

SQLite is provided by Node's built-in node:sqlite module. No native database npm addon or compiler toolchain is required. A Node experimental/release-candidate SQLite notice may appear on some Node 24 releases.

## Try the workflow without API costs

1. Open Alex → Asset pack → Generate pack.
2. Approve a reference and make it canonical; then Approve character.
3. Open Video studio → Generate idea → Approve concept.
4. Review/edit/regenerate the script → Approve & generate.
5. Preview/download the mock MP4 → Save → review proposed memories.

Mock image cards reuse the sample portrait. Mock video is a labeled sample, not a performance of your script. New characters, products, relationships, reference uploads, memory editing, JSON export, approval gates, history and snapshots remain available.

## Enable real generation

The first start copies `.env.example` to `.env`. Open `.env` in a local text editor and fill in your own keys:

```dotenv
LLM_API_KEY=your_OpenAI_key
IMAGE_API_KEY=your_OpenAI_key
VIDEO_API_KEY=your_Runway_key
TTS_API_KEY=your_OpenAI_key
IMAGE_COST_ESTIMATE=your_conservative_USD_estimate_per_image
VIDEO_COST_PER_SECOND=your_conservative_USD_rate
TTS_COST_ESTIMATE=your_conservative_USD_allowance_per_job
FFMPEG_PATH=ffmpeg
```

These estimate placeholders must be replaced with numbers based on your chosen providers/models. The app does not fetch live prices. Restart the app after changing .env. Enable Live in Settings only when ready. Mock content remains mock; create a new idea after switching to Live.

Live audio/video requires **FFmpeg and FFprobe**. Put both on PATH, or set `FFMPEG_PATH` and optionally `FFPROBE_PATH` in `.env`. When FFmpeg has an absolute path, the worker looks for FFprobe beside it. Both are checked before new media submissions. Mock playback needs neither.

Models are the same as the original version: OpenAI for concepts/images/speech and Runway for video. Provider availability depends on your accounts. API traffic is billed by those providers; your local storage/hosting has no provider bill. Keys stay in the backend and worker, never in the client UI or SQLite. Do not commit/share .env.

Live generation needs Internet. Uploaded references and relevant character/script information are sent to the selected providers when you approve live requests. There is no automatic social posting.

## Paid job preservation and recovery

Each live job keeps its inputs, generated frames, original clips, speech, normalized scenes, final output, provider task IDs and a checkpoint file under data/jobs/{jobId}. Files are retained after success, failure and restart. A resumed job reuses completed files and polls saved video task IDs instead of submitting them again.

Choose **Resume saved job** in Activity or the failed video panel. A RUNNING job can be resumed after its heartbeat has been inactive for two minutes. Restart the app first if the old worker crashed. **Regenerate / Return to script** creates a new attempt and may incur fresh provider charges.

If a process dies during submission before the response/task ID is saved, the worker stops with an “unknown outcome” error rather than blindly charging again. Review the provider dashboard before initiating a new attempt. Automatic exactly-once billing cannot be guaranteed across external APIs. Saved intermediate files remain intact. Provider links may expire before a failed download can be recovered.

The app uses estimated per-job limits, not a global billing enforcement system. Audio preparation and video rendering are separate jobs with separate estimates. New edits reject speech truncation and validate cached audio before reuse. Semantic/vector memory retrieval and automatic provider-price synchronization remain outside this version. Live API calls were not made during verification.

## Flexible UGC workflow

New projects use the v2 edit pipeline. Existing projects retain their original media and recovery checkpoints until you choose **Prepare repaired voice previews** or generate a new script.

1. Choose a target length (10–60 seconds), natural or exact timing, pacing, and the proportion of speaking-to-camera shots.
2. Generate/edit the script. Add, remove or reorder shots, change source trims, and assign one voice take to several adjacent shots for continuous narration.
3. **Approve script & preview voice** generates and validates audio before video. Listen to each take; **Regenerate this voice take** preserves other validated takes.
4. **Approve voice & generate video** creates missing footage and renders the edit. **Approve voice & rebuild saved footage** uses saved footage and fails if new footage would be needed. Changed speech or speaking-shot trims may still require paid lip sync.
5. Optionally upload real Wim screen recordings or other source clips. Add music or room tone, set background levels and trims, then rebuild the mix. Uploaded source audio is discarded; the approved voice and selected sound tracks form the final mix.

To compare a different supported Runway model or create a fresh take, change **Video model** in Settings and select **Create fresh generated footage** in voice review. This creates new image/video requests; imported clips still use their uploaded sources. Keep the same approved voice performance for a useful comparison.

Natural timing expands shot groups to fit complete speech. Exact timing rejects overflow instead of chopping words. Generated Runway sources currently remain 5 or 10 seconds, but the edit can use shorter portions. If audio timing makes a generated shot longer than 10 seconds, split it into adjacent shots sharing the same voice take. Imported footage can be longer.

Speaking shots use the optional Sync adapter; supporting footage uses voiceover. To enable speaking shots, add `LIPSYNC_API_KEY`, `LIPSYNC_MODEL` (default `lipsync-2-pro`) and a conservative `LIPSYNC_COST_PER_SECOND` to `.env`, then restart. The worker uploads video/audio directly to Sync and polls saved task IDs; localhost media does not need public hosting. See [Sync multipart API](https://sync.so/docs/api-reference/api/generate-api/create-with-files). Do not assume changing a video model alone enables lip sync.

`TTS_COST_ESTIMATE` is now a conservative **per voice segment** estimate. The audio job reserves two attempts for each missing segment: one initial response and one retry only if the returned media fails validation. Ambiguous submissions stop. Video estimates include every new starting frame, generated source seconds and speaking-shot lip sync. Rebuilds can reuse matching completed lip-sync outputs.

The final export uses normalized video timestamps, one continuous audio mix, measured speech caption timing, and per-spoken-interval audio checks. Sound-level/duration checks do not verify pronunciation or every spoken word; listening remains required. Realism and live lip-sync quality need evaluation on actual provider samples. No guarantee of indistinguishable video is implied.

For a failed download, the failed video panel offers **Import downloaded MP4** with a shot selector. This validates the clip and places it in the saved job automatically; no filename changes are needed. Existing clips cannot be overwritten through this recovery control. Downloads retry safe GET requests, refresh expired Runway links from the same task, and never disable TLS verification.

Runway/Sync task-status GET requests and MP4 response-body reads retry transient connection resets, timeouts, rate limits and server failures up to five times with backoff. Download retries can refresh the signed URL from the same saved task; if that status refresh fails, the existing URL is retained for another download attempt. After a Node download transport failure, the worker also tries the system `curl.exe` on Windows (`curl` elsewhere), using normal certificate verification and HTTPS redirects. `DOWNLOAD_CURL_PATH` can specify a custom executable. Retry/fallback progress appears in the job stage; signed URLs and credentials are not included in errors. Paid generation POST requests are not automatically repeated.

The failed-job panel identifies missing starting images and counts completed clips from the saved job. **Starting frame** failures are image requests rather than MP4 downloads. **Resume saved job** explains the blocker when an image request has an unknown outcome. If you do not have a recovered image, accept the possible additional image charge and click **Retry shot N starting image & resume**. This explicitly authorizes only that starting-image request, backs up the original checkpoint, and queues the same job with completed clips preserved. It does not automatically repeat other ambiguous requests.

If you already have a saved PNG/JPEG/WebP, open **Import a file you already have**, select **Starting image** and the shot, and click **Choose starting image file to import** to select it. Wait for the imported message, then click **Resume saved job**. The app validates/converts it to the correct `frame-{index}.png` without another image submission. The dropdown selections only choose the import destination; they do not generate or retrieve files. Saved starting images and clips cannot be overwritten.

## Reusable character voices

Open a saved character's **Voice** tab. Upload a clean recording of one speaker (MP3, WAV, M4A, Ogg, WebM or FLAC; 10–180 seconds; up to 25 MB). About 1–2 minutes in the desired accent, energy and tone is recommended. The recording is validated and saved locally; uploading alone does not create a provider voice.

For voice cloning, add these values to `.env` and restart the app:

```dotenv
ELEVENLABS_API_KEY=your_key
ELEVENLABS_TTS_MODEL=eleven_multilingual_v2
ELEVENLABS_TTS_COST_ESTIMATE=your_conservative_USD_estimate_per_segment
```

Your ElevenLabs account needs Instant Voice Cloning access and permissions to create/read voices and generate speech. In live mode, confirm your rights to the recording and click **Create reusable voice**. This sends the sample to ElevenLabs once and saves its voice ID on the character. Complete any verification requested by ElevenLabs before generating previews. New videos reuse the saved voice; they do not create another clone. You can also connect an existing voice ID from your account. See the [ElevenLabs cloning guide](https://elevenlabs.io/docs/eleven-creative/voices/voice-cloning/instant-voice-cloning) and [clone API](https://elevenlabs.io/docs/api-reference/voices/ivc/create).

Use **Speaking speed** in the same tab and **Save voice settings**. 1.0 is normal; try 1.10 for quicker delivery. Uploaded voices use the recording's accent/tone and a supported speed range of 0.7–1.2. OpenAI preset voices remain available and use character tone plus take delivery as guidance when supported by the selected model.

For an existing script, click **Use latest character voice**, then generate and review fresh voice previews. This clears its cached voice/timing approval while preserving script text, footage and previous exports. Character changes do not silently alter an active job or saved video's snapshot.

Custom-voice audio jobs reserve two attempts per missing speech segment using `ELEVENLABS_TTS_COST_ESTIMATE`, not the OpenAI estimate. Only a completed defective audio response is automatically retried once. Ambiguous clone creation is blocked from repeat submission: check your ElevenLabs library and connect the existing voice ID to recover. The app does not delete voices from your provider account.

## Backups and restore

Stop the server, then run:

```powershell
npm run backup
```

It creates `backups/{timestamp}/` containing a consistent SQLite backup plus media and job folders. API keys and the worker token are excluded. Copy the backup to another disk to protect against drive failure. Backups require enough free space for another copy of your media.

Restore while stopped: rename your current data folder as a precaution, create a new data folder, and copy the backup's studio.sqlite, media and jobs into it. Start the app. The worker token is regenerated automatically. Keep .env separately if you need to restore keys/settings.

The ZIP starts a **fresh workspace** with seed data. It does not include live Site records or your previous data. The original Site's JSON export is useful as a portable reference, but an import/migration UI is not included.

## Local access model

This edition intentionally has no login and supports one local user. It binds to loopback, rejects non-local Host headers and cross-origin browser requests, and authenticates worker commands with a local generated secret. Other programs running as you on your PC can access your files and localhost server. Do not expose it through a public tunnel or change the bind address to 0.0.0.0 without adding real authentication.

## Developer commands

- `npm run dev`: localhost development server plus media worker.
- `npm run build`: standalone Next.js production build; no deployment.
- `npm start`: run the production build locally plus media worker.
- `npm run typecheck`: TypeScript check.
- `npm test`: HTTP integration test against an already-running local server. This test creates test records; use a disposable DATA_DIR, not your real workspace. TEST_URL can override the URL.
- `npm run test:local`: starts an isolated localhost test server and disposable SQLite workspace; does not launch the media worker or use real provider credentials.
- `npm run test:media`: tests FFmpeg assembly, audio rejection, continuous speech, timing, recovery and mocked provider lifecycles in a temporary folder. Requires FFmpeg/FFprobe; makes no live provider calls.
- `npm run backup`: stopped-server backup of database, media and checkpoints.

The original UI and provider architecture are retained, with cloud storage/authentication replaced by local adapters. This build targets Windows, but the Node scripts also run on macOS/Linux. It is not intended for shared/public hosting.
