# Realistic recurring-character production

This branch makes new posts use a staged production process: script → voice approval → starting-frame approval → animation → final review. Old videos and recovery files remain usable. A technically valid export is not automatically a convincing human performance.

## What the review found

The latest completed seven-shot export used Gen-4 Turbo. Sampled frames show a polished, shallow-focus look, repeated phone handling, and visible Sync watermarks. One speaking shot combines eating and a phone prop. The script also turns a social-planning app into a source of protein-specific restaurant recommendations, which is not supported by the supplied product description. These are separate visual, performance and editorial problems; more resolution alone will not solve them.

The old workflow generated starting images and immediately animated them. It injected product references into every shot and could turn a requested voiceover edit into speaking shots. Cost checks treated voice and picture as separate jobs. The new workflow addresses these issues before the expensive animation stage.

## Start here

1. Restart the local app. In Settings, select **Use recommended quality settings**. Existing persisted settings are deliberately not silently rewritten. The recommendation is GPT Image 2 for stills and Gen-4.5 for motion; no additional provider account is required.
2. Open the character's canonical portrait at full size. Approve it only if the facial proportions, skin texture and lighting already look photographic. If the anchor looks like a render, replace it before making a month of content. Keep an identity anchor stable across the month, and avoid repeatedly using generated video frames as new identity anchors.
3. Connect a consistent ElevenLabs voice in the existing Voice tab, or keep the existing preset. Listen for the desired accent and conversational delivery. Do not create a new clone for each post. Use an adult fictional identity and a voice you are authorized to use.
4. Start with a **10–15 second, 2–3 shot voiceover post**, no product. Use one complete spoken thought over ordinary footage. Select a brief from the 30-post planner or write one specific moment. Quiet moments intentionally have no speech; add ambience/music in the existing sound panel if wanted.
5. Review the script, then preview and approve the voice. Prepare the missing starting frames. Inspect each at full size against the canonical portrait. Reject and replace weak frames individually. Animation stays blocked until each generated shot has an approved frame.
6. Animate the approved frames. Inspect the raw shot previews and the finished export. **Request new motion for this shot** retains other matching raw footage. Render again to generate only the requested replacement, subject to the remaining budget. Changing a visual description invalidates its frame; changing only words can retain visual assets.
7. Save/download only after checking the final cut on a phone. Keep the AI-character disclosure supplied by the studio when publishing. Upload real screen recordings when an interface must be legible.

## Acceptance criteria

Inspect the whole clip at normal speed, then pause around cuts and hand movements:

- Identity: same nose, eye spacing, hairline, jaw, age and distinguishing marks across shots.
- Texture: ordinary skin variations and hair detail; reject waxy smoothing, painted shadows and plastic teeth.
- Motion: ordinary speed, grounded hands and objects, stable body proportions; reject morphs, sliding props and exaggerated slow motion.
- Speech: understandable words, natural pauses, consistent voice; for speaking shots, unobstructed lips that track the actual recording. Do not combine eating, drinking or turning away with talking.
- Editorial continuity: credible location/wardrobe changes, a specific everyday event, restrained product use and no invented product capabilities.
- Delivery: correct framing, appropriate ambience, no unwanted provider watermark, no cut-off words or excessively long silences. The app preserves provider outputs; it does not remove provider watermarks.

The recommended initial month is mostly day-in-the-life, routines, observations and small stories, with a few quiet posts and two optional product briefs. The planner loads briefs individually; it does not batch-spend or automatically publish. Review each post, and approve durable memories after saving to support later callbacks.

## Cost and quality tradeoffs

The app supports two verified Runway image-to-video request profiles, using 5 or 10 generated seconds per source. Gen-4.5 is $0.12 per generated second; Gen-4 Turbo is $0.05. The estimate cannot drop below those model rates even if an older `.env` contains a lower value. Higher configured estimates are respected. See [Runway API pricing](https://docs.dev.runwayml.com/guides/pricing/) and [generation contract](https://docs.dev.runwayml.com/guides/using-the-api/).

For example, three 5-second Gen-4.5 sources cost $1.80 in video generation. With three $0.30 starting-image reservations and two $0.10 voice attempts, the initial media estimate is $2.90. At that estimate, 30 accepted posts are $87 before additional takes, setup, subscriptions, tax and text planning. This is an example, not an invoice or a promise that one take will pass review. Longer footage and lip sync consume more of the budget.

New posts enforce a cumulative **estimated media ceiling of at most $10 per content record**, including earlier media attempts. Failed, cancelled and ambiguous jobs retain conservative reservations because a provider may already have charged. Voice estimates reserve one retry for a completed defective response. Matching raw footage is reusable without another video reservation. Speaking shots need an explicitly configured Sync per-second estimate and reserve lip sync conservatively, even when the worker may reuse a completed result. These reservations can overstate actual spend; do not clear them casually.

Character setup, provider subscriptions, tax and text-planning calls are not metered by this media ledger. Check provider invoices and keep headroom below $10 if that is an all-inclusive target. The app cannot impose a provider-side dollar cap. Check `IMAGE_COST_ESTIMATE`, the selected voice estimate, and `LIPSYNC_COST_PER_SECOND` against your actual accounts. A custom ElevenLabs voice uses its own estimate. New posts have conservative image/voice floors of $0.30 per image and $0.10 per speech attempt.

Settings are frozen when a new media job is queued. Resume continues the saved models and inputs. A changed script, voice or requested motion take requires a new attempt. Unknown submission outcomes remain blocked; downloads and status polling may retry safely without submitting new paid generations.

## Why these model choices

Runway documents that the starting image determines composition, subject, light and style, while the motion prompt should describe movement. That supports inspecting the image first and keeping motion instructions short. See [image-to-video prompting](https://help.runwayml.com/hc/en-us/articles/48324313115155-Image-to-Video-Prompting-Guide).

OpenAI documents high-fidelity image inputs for GPT Image 2 by default. The worker requests high output quality and omits `input_fidelity` for that model. If an existing workflow keeps GPT Image 1 or 1.5, it explicitly requests high input fidelity. See [image edit parameters](https://developers.openai.com/api/reference/resources/images/methods/edit). These parameters help preserve identity; they do not guarantee it.

We retain the existing OpenAI, Runway and optional ElevenLabs/Sync integrations rather than adding another orchestration platform. Voiceover footage avoids a face-altering lip-sync pass. Short, controlled speaking shots remain available when the story needs them. If those still fail the acceptance criteria, externally produced performance-driven footage can be uploaded through the existing source-clip controls.

## Isolated quality pilot

`scripts/quality-pilot.mjs` is a deliberately separate paid benchmark, never a background test. It reads a character snapshot from an existing job, writes under `.review/quality-pilot`, and uses a $2 estimated media ceiling. It does not change the database or existing media.

```powershell
node --env-file=.env scripts/quality-pilot.mjs frame <existing-job-id>
# Inspect .review/quality-pilot/jobs/pilot-frames/frame-0.png before animating.
node --env-file=.env scripts/quality-pilot.mjs video
```

The pilot uses a five-second quiet performance to isolate appearance and motion. It does not qualify speech or the full monthly workflow. An unknown image submission stays blocked; only an explicitly intended `--retry-frame` flag on the frame command authorizes another possible image charge and backs up that pilot checkpoint. Never use it just to poll a still-running request.
