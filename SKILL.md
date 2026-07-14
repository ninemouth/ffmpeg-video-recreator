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

3. Extract keyframes from the source directory:

```bash
node scripts/extract-keyframes.mjs --input "/path/to/video-folder" --run "work/runs/<run-id>" --mode hybrid
```

4. Read `references/report-contract.md`, inspect the extracted frames, then fill the generated `output/recreate-report.md`.

## Workspace Contract

Each task must stay inside one run directory:

```text
work/runs/<timestamp-slug>/
├── input/              # optional copied source assets or symlinks
├── frames/             # extracted keyframes grouped by video
├── metadata/           # ffprobe, manifest, command log, frame index
├── output/             # final recreate report and script artifacts
└── qa/                 # verification notes and risk checks
```

Do not mix outputs from different user tasks. If the user asks for a new video folder or a materially different creative goal, create a new run.

## Extraction Policy

Use `hybrid` mode by default. It combines scene-change frames with interval sampling so fast cuts and slow scenes are both represented.

Use `scene` mode when the video is editing-heavy, cinematic, ad-like, or music-driven.

Use `interval` mode when the video has long static scenes, tutorials, screen recordings, lectures, or low visual change.

Recommended command shape:

```bash
node scripts/extract-keyframes.mjs --input "/path/to/videos" --run "work/runs/<run-id>" --mode hybrid --interval 2 --scene-threshold 0.32
```

## Report Creation

The scripts generate a report scaffold, not a finished creative judgment. After extraction:

1. Open `metadata/manifest.json` and `metadata/frame-index.json`.
2. Inspect representative frames from each video.
3. Write `output/recreate-report.md` using `references/report-contract.md`.
4. Include enough detail for another AI to recreate the video while allowing intentional changes.

The report must include:

- Source inventory and technical metadata.
- Frame-by-frame visual observations.
- Shot sequence with timestamps, camera movement, composition, lighting, subject/action, and text overlays.
- Narrative/script reconstruction including voiceover, dialogue, captions, on-screen text, beats, and transitions.
- Style DNA: pacing, color, typography, sound/music assumptions, editing rhythm, and emotional arc.
- Reproduction prompt pack for AI video generation.
- Modification plan separating preserved elements from user-requested changes.
- Risk notes for missing audio, unreadable text, blurry frames, or under-sampled scenes.

## References

Read `references/report-contract.md` before writing a final report.

Read `references/github-install-update.md` when the user asks to install, update, reinstall, distribute, or deploy this skill from GitHub.

Read `references/ffmpeg-platform-notes.md` only when FFmpeg installation fails or the current OS needs manual remediation.
