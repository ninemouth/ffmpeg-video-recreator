---
name: ffmpeg-video-recreator
description: Install or locate FFmpeg on macOS or Windows, create isolated per-task video-analysis workspaces, extract representative and scene-change keyframes from one or more videos in a directory, and produce recreate-ready video analysis reports, scripts, shot lists, prompts, and modification plans for AI video recreation. Use when Codex is asked to analyze videos, extract keyframes, summarize a video for replication, reverse-engineer a video's structure, create a remake script from video frames, or prepare assets and reports for AI-assisted video recreation.
---

# FFmpeg Video Recreator

## Core Workflow

If the skill is not installed or the user asks to install/update from GitHub, follow `references/github-install-update.md` first. Prefer the bundled installer/update script after cloning the repo.

1. Create a separate run workspace for every task:

```bash
node scripts/create-run-skeleton.mjs --input "/path/to/video-folder" --slug "campaign-remake"
```

2. Check FFmpeg and install it only when missing:

```bash
node scripts/install-ffmpeg.mjs --check
node scripts/install-ffmpeg.mjs --install
```

3. Extract keyframes and run the local audio pipeline from the source directory. Choose the report language from the user's interaction language: use `--language zh` for Chinese conversations, `--language en` for English conversations, and `--language auto` only when unclear.

```bash
node scripts/extract-keyframes.mjs --input "/path/to/video-folder" --run "work/runs/<run-id>" --mode hybrid --language zh
```

This command runs three audio layers by default:

- `audio-probe`: `ffprobe` audio stream inventory plus extracted 16 kHz mono WAV files under `audio/`.
- `audio-signal-analysis`: local, non-AI FFmpeg/librosa analysis for silence, volume, loudness, RMS peaks, rhythm, and spectrum.
- `optional-audio-ai`: local-only provider detection for speech ASR and sound-event models. Unsupported providers are written as `skipped` and never block keyframe delivery.

No API provider is used by default. OCR, when used by the agent outside these scripts, is only a fallback for visible on-screen text and must not be described as speech recognition.

If optional local Python support is missing, scripts auto-install it into the skill-owned venv instead of the system Python:

```bash
node scripts/install-audio-support.mjs --profile signal
```

Manual installation remains available for debugging, but the normal workflow should not require the user to run install commands first. The scripts auto-detect `.venv-audio`; a custom venv can be provided through `FFMPEG_SKILL_AUDIO_PYTHON`.

4. Read `references/report-contract.md`, inspect the extracted frames and audio metadata, then fill the generated `output/recreate-report.md`.

5. Deliver the complete `output/` package, not only a contact sheet or report.

6. For handoff to another AI video tool, use `output/recreation-pack/` as the portable recreation package.

## Workspace Contract

Each task must stay inside one run directory:

```text
work/runs/<timestamp-slug>/
├── input/              # optional copied source assets or symlinks
├── frames/             # raw extracted keyframes grouped by video
├── audio/              # extracted 16 kHz mono WAV files for local analysis/ASR
├── metadata/           # ffprobe, manifest, command log, frame index, frame quality report
├── output/             # final delivery package
│   ├── keyframes/      # copied keyframes for delivery
│   ├── recreation-pack/# portable pack for AI recreation handoff
│   ├── keyframes-index.md
│   ├── delivery-manifest.json
│   └── recreate-report.md
└── qa/                 # verification notes and risk checks
```

Do not mix outputs from different user tasks. If the user asks for a new video folder or a materially different creative goal, create a new run.

## Extraction Policy

Use `hybrid` mode by default. It combines scene-change frames with interval sampling so fast cuts and slow scenes are both represented.

Use `scene` mode when the video is editing-heavy, cinematic, ad-like, or music-driven.

Use `interval` mode when the video has long static scenes, tutorials, screen recordings, lectures, or low visual change.

Recommended command shape:

```bash
node scripts/extract-keyframes.mjs --input "/path/to/videos" --run "work/runs/<run-id>" --mode hybrid --interval 2 --scene-threshold 0.32 --language zh
```

By default, extracted keyframes are copied into `output/keyframes/` as formal deliverables. Use `--no-copy-keyframes` only when the video is huge and the user explicitly prefers references to the raw `frames/` directory.

Frame quality filtering is enabled by default. After FFmpeg extracts candidate frames, the script uses FFmpeg to decode each JPEG to a small grayscale buffer and rejects mostly black, mostly white, or near-empty transition frames before copying formal deliverables. Rejected frames are recorded in `metadata/frame-quality.json`; the script tries nearby replacement timestamps first. Use `--no-frame-quality` only when the source intentionally contains black-background title cards or other low-luma frames that must be preserved.

## Delivery Package

The final user-facing delivery is the whole `output/` directory:

- `output/README.md`: direct-access delivery index for the final reply.
- `output/recreate-report.md`: language-matched recreate report.
- `output/keyframes/`: extracted keyframes grouped by source video.
- `output/keyframes-index.md`: human-readable keyframe index with visual-note placeholders.
- `output/delivery-manifest.json`: machine-readable list of report, keyframes, metadata, and source video summaries.
- `output/report-contract-check.json`: proof that the final report passed the contract gate.
- `output/recreation-pack/`: independent package for handing to AI video tools or creative operators.
- `output/audio-analysis.md`: non-AI audio signal summary when source audio exists.
- `output/speech-transcript.md`: local ASR transcript or a clear skipped status.
- `output/audio-events.md`: local sound-event AI status or a clear skipped status.

Every run must also expose a stable direct-access index:

- `output/README.md`: user-facing delivery entry index.
- `output/delivery-manifest.json` field `direct_access`: machine-readable list of the same direct entries, in final-response order.

When reporting completion to the user, list the `direct_access` entries in order. Do not replace the full direct-access list with only "important files"; highlights may be added after the full list.

The recreation pack contains:

- `README.md`: how to use the pack.
- `recreation-brief.md`: compact remake brief.
- `shot-list.md`: shot-by-shot scaffold with reference-frame links.
- `segment-plan.md`: segment-by-segment generation plan with start/end frames and previous-end-frame continuity anchors.
- `prompts.md`: master prompt, per-shot prompt, negative prompt, and continuity constraints.
- `continuity-locks.md`: rules for identity, scene, camera, motion, style, and boundary continuity.
- `modification-plan.md`: preserve/change plan.
- `reference-keyframes/`: copied keyframes for recreation input.
- `segments/`: per-segment start frame, end frame, and previous-segment-end anchor files.
- `recreation-manifest.json`: machine-readable pack inventory.

If a contact sheet is also generated, treat it as a navigation aid. It does not replace the individual keyframe files.

## Segment Continuity

AI video recreation is usually generated in short segments. The recreation pack must preserve continuity across segment boundaries:

- Segment 1 establishes the stable identity, scene, camera language, lighting, color, typography, wardrobe/props, and motion direction.
- Segment 2 and later must use the previous segment's `end-frame.jpg` as `previous-segment-end-frame.jpg`.
- The later segment should first match the previous segment's final state, then continue into the new action.
- Segment prompts must explicitly lock identity, pose trajectory, camera angle, lens feel, lighting, color grade, wardrobe/props, background geometry, text style, and motion direction.
- Requested changes should be introduced only in the segment where the modification plan says they begin.

Use `output/recreation-pack/segment-plan.md` and `output/recreation-pack/continuity-locks.md` as the control files for segmented generation.

## Report Creation

The scripts generate a report scaffold, not a finished creative judgment. After extraction:

1. Open `metadata/manifest.json` and `metadata/frame-index.json`.
2. Inspect representative frames from each video.
3. Open `output/keyframes-index.md` and add concise visual notes for the most important frames.
4. Write `output/recreate-report.md` using `references/report-contract.md`.
5. Run `node scripts/validate-report-contract.mjs --run "work/runs/<run-id>"`.
6. Fix every failed check before reporting completion.
7. Include enough detail for another AI to recreate the video while allowing intentional changes.

Use the user's interaction language for the final report and keyframe notes. If the user speaks Chinese, the report, section labels, summaries, shot table, script, and prompts should be Chinese unless the user asks otherwise.

The report must include:

- Source inventory and technical metadata.
- Delivered keyframes and an index that links frame files to observations.
- Independent recreation pack with brief, shot list, prompts, modification plan, and reference keyframes.
- Segment continuity plan with previous-end-frame anchors for multi-part AI video generation.
- Frame-by-frame visual observations.
- Shot sequence with timestamps, camera movement, composition, lighting, subject/action, and text overlays.
- Narrative/script reconstruction including voiceover, dialogue, captions, on-screen text, beats, and transitions.
- Style DNA: pacing, color, typography, sound/music assumptions, editing rhythm, and emotional arc.
- Reproduction prompt pack for AI video generation.
- Modification plan separating preserved elements from user-requested changes.
- Risk notes for missing audio, unreadable text, blurry frames, or under-sampled scenes.
- Audio evidence from `metadata/audio-streams.json`, `metadata/audio-analysis.json`, `metadata/speech-transcript.json`, and `metadata/audio-events.json`.
- OCR notes only for visible on-screen text. Do not use OCR as a substitute for speech ASR.
- Contract proof from `output/report-contract-check.json` with `status: "passed"`.

## Audio and OCR Policy

Audio is handled in three separate layers:

1. `audio-probe`: `ffprobe` records audio streams and `ffmpeg` extracts normalized WAV files.
2. `audio-signal-analysis`: FFmpeg/librosa analyze silence, loudness, volume peaks, RMS curve, tempo, and spectrum without AI or GPU.
3. `optional-audio-ai`: local speech ASR and sound-event providers are attempted only when available. Provider status must be written to JSON. Unsupported providers are skipped without blocking the rest of the workflow.

Local ASR provider selection is hardware-aware:

- CPU and Apple Silicon prefer `whisper.cpp`.
- NVIDIA CUDA prefers `faster-whisper`, then Qwen3-ASR, then whisper.cpp fallback.
- Qwen3-ASR is an advanced optional CUDA provider.
- API providers are disabled by default.
- In `auto` mode, missing local ASR support is installed automatically when a supported installer exists: Apple Silicon/CPU attempts `whisper.cpp` plus a local ggml model; NVIDIA attempts `faster-whisper`.
- In `auto` mode, missing local sound-event support is installed automatically when TensorFlow can run on the available Python/hardware. The default local event runner is YAMNet.

OCR remains a visible-text-only fallback. It can read captions, overlays, titles, product text, and UI text in frames. It must not be used to infer speech when ASR is unavailable.

Optional support libraries are installed by `scripts/install-audio-support.mjs` into `.venv-audio/`, which is excluded from git and skill sync backups. Do not install these packages into system Python unless the user explicitly asks.

After installation/deployment changes, run:

```bash
npm run audio:self-check
```

The self-check creates a temporary synthetic video and verifies FFmpeg/librosa signal analysis, local ASR, and local YAMNet sound-event classification end to end. A supported machine should pass self-check without user setup commands.

## References

Read `references/report-contract.md` before writing a final report.

Read `references/github-install-update.md` when the user asks to install, update, reinstall, distribute, or deploy this skill from GitHub.

Read `references/ffmpeg-platform-notes.md` only when FFmpeg installation fails or the current OS needs manual remediation.
