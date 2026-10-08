You are taking over development and debugging of Character Studio, a local Windows app for creating AI-character social videos. Inspect the current implementation before editing: several patches were applied manually after the original download.

UPDATE — OCTOBER 7, 2026

The user approved the flexible UGC/audio-first redesign. Implementation is now present:

- New concepts use pipelineVersion: 2, separate speech segments, shot kinds, trims, and generated timelines. Existing records/checkpoints are not automatically migrated.
- components/edit-studio.tsx provides voice preview/approval, selective voice regeneration, shot editing/reordering and fresh-footage controls. components/audio-mix.tsx handles optional music/room tone.
- workers/edit-worker.mjs handles v2 AUDIO/VIDEO/REBUILD jobs. workers/media-tools.mjs contains FFmpeg/FFprobe validation, timeline planning, hashes and robust clip downloads. Original worker still handles legacy videos and asset packs.
- app/api/media/route.ts supports validated source uploads, sound uploads and manual raw-clip recovery into failed/cancelled jobs without filename changes.
- Speaking shots require optional Sync credentials (LIPSYNC_API_KEY, LIPSYNC_MODEL, LIPSYNC_COST_PER_SECOND). Provider requests upload files directly; no public media hosting is required. Live quality is not yet benchmarked.
- Natural edits extend groups to fit measured speech; exact edits reject overflow. Runway source generation still uses 5/10-second clips; shots exceeding ten seconds must be split or use uploaded footage. Saved sources too short for a repaired voice fail with an actionable error instead of truncating speech.
- TTS_COST_ESTIMATE is per speech segment for v2. Estimates reserve two attempts; a completed defective response gets at most one retry, while an ambiguous submission is preserved and blocked.
- Legacy repair is explicit: Prepare repaired voice previews, review takes, then rebuild saved footage. This creates new voice takes and a new export while preserving originals. Legacy resumes now validate speech and reject truncation.
- Settings exposes video model choice. Fresh generated footage is opt-in; normal rendering tries to reuse matching sources, and rebuild never creates missing video footage. Changed speaking audio/trims can require new paid lip sync.
- Original completed job was inspected read-only: voice-1.mp3 is 0.36s, peak -55.5 dB; scene-1.mp4 is effectively silent. voice-2.mp3 is 6.6s, but legacy scene-2.mp4 is four seconds. Defective TTS response cause remains unknown.
- Windows TypeScript/build, isolated app tests and FFmpeg/media/provider-fixture tests pass. No live provider calls and no changes to .env, the user's SQLite database, original media or checkpoints. See README.md and VALIDATION.md for workflow/setup/limitations.

The older history below describes the original pipeline; check the actual code and this update before relying on it.



PURPOSE



Build reusable fictional characters with:

\- Identity, appearance, personality, wardrobe, environments, and voice.

\- Approved reference-image asset packs for consistent appearance.

\- Persistent memories and continuity across videos.

\- Product relationships and optional product integration.



The user selects a character and product, supplies a rough video idea or generates one, reviews/regenerates the script, approves it, then generates and previews the finished video. The user downloads and manually posts videos to social media; automatic publishing is not needed.



A primary use case is marketing Wim, the user’s social/activity app focused on spontaneity and helping friends choose activities instead of debating in group chats.



LOCAL DEPLOYMENT REQUIREMENTS



\- Windows laptop, PowerShell, VS Code.

\- Run with npm run dev and access through localhost:3000.

\- SQLite database local to the project.

\- All generated media and job recovery files on local disk.

\- API keys in server-side .env.

\- No dependency on ChatGPT hosting/authentication or cloud storage.

\- Preserve existing records, media, paid generations, and credentials.

\- Do not deploy anything.



An earlier cloud-hosted version exists, but this task concerns the current local project only.



IMPLEMENTATION



Original downloadable version: character-studio-local-windows-v0.2.0.zip.



Stack:

\- Node.js 24+, Next.js, React, TypeScript.

\- Native node:sqlite.

\- FFmpeg for video/audio assembly.

\- Standalone Node media worker automatically started with the server.



Important paths:

\- lib/engine/types.ts — domain models.

\- lib/engine/seed.ts — initial records/default settings.

\- lib/engine/store.ts — SQLite persistence.

\- lib/engine/storage.ts — local media storage.

\- lib/engine/pipeline.ts — context/memory retrieval and prompt compilation.

\- lib/engine/providers.ts — provider wrappers.

\- app/api/engine/route.ts — user actions, concepts/scripts, approvals/jobs.

\- app/api/worker/route.ts — worker claiming/progress/completion.

\- workers/media-worker.mjs — actual live media generation and assembly.

\- scripts/start.mjs — localhost server/worker launcher.

\- scripts/backup.mjs — backup while server is stopped.

\- Start-Character-Studio.cmd — Windows launcher.



Persistent data:

\- data/studio.sqlite — application records.

\- data/media/ — uploaded/generated assets and completed videos.

\- data/jobs/<job-id>/ — intermediate files and recovery checkpoints.



The app is single-user and bound to loopback. It has mock and live modes.



PROVIDERS AND DEFAULT MODELS



.env:

LLM\_API\_KEY       OpenAI

IMAGE\_API\_KEY     OpenAI

VIDEO\_API\_KEY     Runway

TTS\_API\_KEY       OpenAI



The same OpenAI key can fill the three OpenAI fields.



Default settings:

\- llmModel: gpt-4.1-mini

\- imageModel: gpt-image-1

\- videoModel: gen4\_turbo

\- ttsModel: gpt-4o-mini-tts

\- maxJobCost: 10 USD



Check the persisted settings, because seed defaults do not override an existing DB.



Suggested budget-estimate variables previously given:

IMAGE\_COST\_ESTIMATE=0.30

VIDEO\_COST\_PER\_SECOND=0.06

TTS\_COST\_ESTIMATE=0.05



These are estimates for a budget check, not provider-enforced spending limits.

IMAGE\_COST\_ESTIMATE is per image.

VIDEO\_COST\_PER\_SECOND is per generated second.

TTS\_COST\_ESTIMATE is added once per whole video job.



WORKFLOW



1\. Create character and approve reference assets.

2\. Generate a concept using character context, memories, and optional product.

3\. Generate structured scenes:

&#x20;  id, order, duration, location, wardrobe, action, dialogue, camera, lighting.

4\. Review and approve the current script version.

5\. Queue a media job.

6\. For each scene:

&#x20;  - Select approved references.

&#x20;  - If multiple references exist, generate a combined starting frame.

&#x20;  - If only one reference exists, the original worker uses it directly.

&#x20;  - Send starting image and motion prompt to Runway image\_to\_video.

&#x20;  - Request 5 seconds for scene.duration <= 5, otherwise 10 seconds.

&#x20;  - Poll saved Runway task ID.

&#x20;  - Download the result.

&#x20;  - Generate OpenAI TTS from scene.dialogue.

&#x20;  - Use FFmpeg to combine video and speech.

7\. Concatenate scenes, save final MP4 and VTT captions.

8\. Preview/download through the UI.



Runway requests use:

\- https://api.dev.runwayml.com/v1/image\_to\_video

\- https://api.dev.runwayml.com/v1/tasks/<task-id>

\- X-Runway-Version: 2024-11-06

\- ratio: 720:1280



RECOVERY BEHAVIOR



Job files use zero-based scene numbering:

\- job.json

\- checkpoint.json

\- frame-0.png

\- raw-0.mp4

\- voice-0.mp3

\- scene-0.mp4

\- ... same for scenes 1, 2, etc.

\- final.mp4

\- captions.vtt



Checkpoint records saved task IDs, output URLs, and submission flags.



The worker skips existing nonempty files. “Resume saved job” reuses checkpoints and existing paid outputs. “Return to script (new generation)” creates a new attempt.



Submission flags deliberately prevent automatic duplicate paid calls after an ambiguous network failure. Do not blindly clear them or resubmit paid requests.



ISSUE 1: RUNWAY BAD-OUTPUT FAILURE — PROMPT PATCH APPLIED



Initial Runway task failed:

status: FAILED

failure: An unexpected error occurred.

failureCode: INTERNAL.BAD\_OUTPUT.CODE01

cost.credits: 0



The initial frame contained:

\- Large burned-in subtitles showing the scene dialogue.

\- A prominent Wim logo on the phone.

\- An inconsistent phone orientation: character looking at a screen facing the viewer.



The pipeline was using a full compiled prompt for both still-image and video generation. It included character identity, personality, memories, product copy, dialogue, camera, etc.



Runway documents logos/text overlays as possible bad-output causes. We inferred this was relevant but did not establish the exact provider-side cause.



User was instructed to patch:



A. workers/media-worker.mjs

Add separate functions:

\- startingFramePrompt(character, scene):

&#x20; appearance, wardrobe, location, lighting, visual action, composition;

&#x20; explicitly no subtitles/dialogue/readable text/logos/watermarks;

&#x20; screen faces the character, plain phone back faces camera.

\- videoMotionPrompt(scene):

&#x20; action, camera, natural subtle movement, one continuous shot;

&#x20; preserve the person/clothing/setting from the starting image.



Replace the combined-frame prompt using scene.prompt with:

startingFramePrompt(content.snapshot, scene)



Replace Runway promptText: scene.prompt.slice(0,1000) with:

promptText: videoMotionPrompt(scene)



B. app/api/engine/route.ts, generateScript prompt

Add instructions:

\- dialogue contains only spoken words, no labels/stage directions.

\- action contains only visible motion/expressions.

\- camera contains framing/movement.

\- no subtitles, logo reveals, readable screens, text-generation requests,

&#x20; or dialogue in action/camera.

\- phone screen faces character.

\- simple continuous action per scene.



C. workers/media-worker.mjs

On FAILED/CANCELED/CANCELLED:

\- Save Runway response to runway-scene-<index>-failure.json.

\- Include failureCode, failure, and task ID in the error.



Inspect the actual files to confirm which patches are present.



Note: The app does NOT automatically composite Wim branding/interface graphics afterward. The prompt’s “added later” wording describes a manual/future editing step.



ISSUE 2: NODE DOWNLOAD FAILURE — STILL UNRESOLVED



After the prompt changes, Runway succeeded:

task ID: 90efeb1c-1ee4-44fd-8e5c-1baa45268062

status: SUCCEEDED

cost.credits: 25



But the app failed with “fetch failed.”

The returned signed CloudFront MP4 URL worked in the user’s browser.



At failure, the job folder had only:

\- checkpoint.json

\- frame-0.png

\- job.json



checkpoint.json contained:

{

&#x20; "scene-0": {

&#x20;   "submitting": false,

&#x20;   "taskId": "...",

&#x20;   "output": "<signed CloudFront MP4 URL>"

&#x20; },

&#x20; "frame-0": "saved"

}



Resume failed immediately again.



This strongly localizes the problem to downloading the already-generated clip through Node fetch. Exact underlying cause is unknown: no detailed network error was supplied.



Original worker download code:

const r = await fetch(output);

if (!r.ok) throw Error('Clip download failed. Resume to retry the saved output.');

await writeFile(raw + '.tmp', Buffer.from(await r.arrayBuffer()));

await rename(raw + '.tmp', raw);



User was advised to replace console.error(e.message) with:

console.error(e);

console.error('Underlying cause:', e.cause);

Check whether this was applied.



Successful workaround:

\- Stop server.

\- Download MP4 in browser.

\- Place it in the corresponding job folder as raw-0.mp4.

\- Restart and resume.

\- Existing-file logic bypassed the download.

\- User reports the whole pipeline then completed.



Investigate robust downloads with useful diagnostics, appropriate timeouts,

safe GET retries, and handling expired signed URLs by retrieving a fresh

output URL for the SAME task.

Do not disable TLS verification.

Do not regenerate paid video to fix a download failure.



ISSUE 3: CURRENT PRIORITY — SECOND SCENE SILENT / LIP SYNC



User’s latest result:

“The second 5s video didn't have any audio. The character was moving their mouth, but there was no audio lined up with it or any sound.”



This has NOT yet been diagnosed.



Two distinct concerns:

1\. Missing audio in scene 2.

2\. Mouth movements not synchronized to spoken dialogue.



Current architecture generates Runway video and OpenAI TTS separately, then muxes them. There is NO explicit lip-sync stage. Muxing speech onto a clip does not align the character’s lips.



Original TTS:

input: scene.dialogue || ' '

voice: content.snapshot.voice.voiceId

speed: content.snapshot.voice.rate

response\_format: mp3



Original per-scene FFmpeg:

\-y

\-i raw-<i>.mp4

\-i voice-<i>.mp3

\-map 0:v:0

\-map 1:a:0

\-vf scale=720:1280:force\_original\_aspect\_ratio=increase,crop=720:1280,fps=30

\-af apad

\-t <scene.duration>

\-c:v libx264

\-preset fast

\-crf 23

\-pix\_fmt yuv420p

\-c:a aac

\-ar 48000

\-ac 2

scene-<i>.tmp.mp4



Final assembly uses FFmpeg concat demuxer with stream copy and +faststart.



Potential avenues to investigate, NOT established causes:

\- Scene 2 dialogue empty/whitespace -> near-silent TTS.

\- TTS audio itself silent, corrupt, or too short.

\- apad leaves long silence after short narration.

\- -t truncates speech longer than scene.

\- Stale nonempty cached voice/scene files skipped on resume.

\- Audio present in scene-1.mp4 but lost/misaligned in final concatenation.

\- Timestamp/stream compatibility issues.



Inspect:

\- job.json content.scenes\[1].dialogue and duration.

\- voice-1.mp3 duration/audio levels/playback.

\- scene-1.mp4 audio stream/playback.

\- final.mp4 around second-scene boundary.

Use ffprobe/FFmpeg diagnostics and actual file evidence before choosing a fix.



For lip sync, explain the architectural limitation clearly. Discuss a real audio-driven/lip-sync stage versus intentional voiceover videos. Do not imply current TTS+mux pipeline provides synchronized speech.



WORKING EXPECTATIONS



\- Work from the current local implementation, not the original ZIP.

\- Inspect applicable AGENTS.md/project instructions.

\- Preserve .env, SQLite, media, and job checkpoints.

\- Avoid rerunning paid generation merely to test plumbing.

\- Prefer saved artifacts and mocked provider responses for debugging.

\- Improve stage-specific logs; never log API keys or full signed URLs.

\- Test patches meaningfully and describe limitations.

\- Original app passed Linux mock workflow/build/persistence tests, but live

&#x20; provider integration and native Windows behavior were not fully tested.

&#x20; The user's Windows runs are exposing those gaps.



