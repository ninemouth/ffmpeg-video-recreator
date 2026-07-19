# Recreate Report Contract

Use this structure for `output/recreate-report.md`. Keep the report practical: another AI or creative operator should be able to recreate the source video from the report and intentionally modify selected parts.

Match the report language to the user's interaction language. If the user asks in Chinese, write the report, frame notes, script, and prompts in Chinese. If the user asks in English, write them in English. Do not default to English when the surrounding task is Chinese.

The final delivery is the complete `output/` directory, not only a contact sheet or report:

- `output/recreate-report.md`
- `output/README.md`
- `output/keyframes/`
- `output/keyframes-index.md`
- `output/delivery-manifest.json`
- `output/report-contract-check.json`
- `output/recreation-pack/`
- `output/audio-analysis.md`
- `output/speech-transcript.md`
- `output/audio-events.md`

Use `output/recreation-pack/` as the portable handoff package for AI video tools or creative operators. It should stand on its own even if the receiver does not inspect the whole run directory.

The direct-access contract is part of the delivery. The run must include `output/README.md`, and `output/delivery-manifest.json` must include a `direct_access` array with the same entries in final-response order. The completion reply must expose those entries directly rather than only naming selected highlights.

Before final delivery, run `node scripts/validate-report-contract.mjs --run <run-dir>`. Do not report completion until it writes `output/report-contract-check.json` with `status: "passed"`.

## Required Sections

### 1. Source Inventory

- Input directory.
- Run directory.
- Video filenames.
- Duration, resolution, frame rate, codec, audio stream presence.
- Audio stream inventory, extracted WAV path, ASR provider status, and sound-event provider status when available.
- Extraction mode and sampling parameters.
- Output keyframe directory.
- Keyframe index path.
- Recreation pack path.
- Delivery direct-access index path: `output/README.md`.
- Delivery manifest `direct_access` status.

### 2. Keyframe Deliverables

List the extracted keyframes as formal evidence assets:

| Video | Frame file | Approx. timecode | What it shows | Why it matters for recreation |
| --- | --- | --- | --- | --- |

Use `output/keyframes-index.md` and the individual image files as the source of truth. A contact sheet can help navigation, but it is not a substitute for individual keyframe deliverables.

### 3. Recreation Pack

Confirm the independent pack exists and is usable:

- `output/recreation-pack/README.md`
- `output/recreation-pack/recreation-brief.md`
- `output/recreation-pack/shot-list.md`
- `output/recreation-pack/segment-plan.md`
- `output/recreation-pack/prompts.md`
- `output/recreation-pack/continuity-locks.md`
- `output/recreation-pack/modification-plan.md`
- `output/recreation-pack/reference-keyframes/`
- `output/recreation-pack/segments/`
- `output/recreation-pack/recreation-manifest.json`

The report should explain that this is the preferred handoff folder for actual recreation work.

### 4. Segment Continuity Plan

AI recreation is usually generated in short segments. Include continuity instructions:

- Segment 1 establishes identity, environment, lens/camera language, lighting, color, wardrobe/props, typography, and motion direction.
- Segment 2 and later must use the previous segment's end frame as the next segment's starting continuity anchor.
- The next segment must first match the previous segment's ending state before continuing into its own action.
- Segment prompts must lock identity, scale, pose trajectory, camera angle, lens feel, lighting direction, color grade, background geometry, wardrobe/props, text style, and motion direction.
- Requested modifications should begin only at explicitly named segments.

Reference:

- `output/recreation-pack/segment-plan.md`
- `output/recreation-pack/continuity-locks.md`
- `output/recreation-pack/segments/<segment-id>/previous-segment-end-frame.jpg`
- `output/recreation-pack/segments/<segment-id>/start-frame.jpg`
- `output/recreation-pack/segments/<segment-id>/end-frame.jpg`

### 5. Executive Summary

- One-paragraph description of what the video is.
- Target audience and probable commercial/creative purpose.
- The most important visual and narrative features to preserve.

### 6. Timeline Reconstruction

Create a table with one row per meaningful shot or beat:

| Timecode | Visual content | Camera/framing | Motion/editing | Text/audio | Recreate notes | Evidence frames |
| --- | --- | --- | --- | --- | --- | --- |

Merge adjacent extracted frames only when they clearly belong to the same shot.

### 7. Visual DNA

Describe:

- Composition patterns.
- Lens/framing feel.
- Camera motion.
- Lighting and color palette.
- Set/location/product styling.
- Character or object continuity.
- Graphic overlays, captions, lower thirds, UI, typography, and logo placement.
- Visible on-screen text from OCR if OCR was used. OCR must be marked as visible text only and must not replace ASR.

### 8. Script Reconstruction

Write a remake script with:

- Scene number.
- Approximate timestamp range.
- Visual direction.
- Action.
- Voiceover/dialogue/caption text, using `[inaudible]` or `[not visible]` when uncertain.
- Speech transcript evidence from `metadata/speech-transcript.json` when local ASR completed; otherwise state that ASR was skipped and why.
- Transition to the next beat.
- Evidence frame references.

### 9. AI Recreation Prompt Pack

Provide:

- A master prompt preserving the video's format, subject, style, pacing, and camera language.
- A segment prompt template that tells later segments to use the previous segment's end frame as continuity context.
- Per-shot prompts for generation or editing.
- Negative prompts for visual artifacts to avoid.
- Continuity constraints for characters, products, logos, props, color, and location.

### 10. Modification Plan

Separate:

- Must preserve.
- Can modify.
- User-requested changes.
- Creative alternatives.

For each change, state which shots are affected and how to adjust prompts/scripts.

### 11. Gaps and QA

List anything that blocks a faithful recreation:

- Missing audio analysis, ASR skipped status, or sound-event model skipped status.
- Sparse frames.
- Blurry or low-resolution frames.
- Fast motion not captured.
- Text too small to read.
- Legal/brand likeness constraints.

End with the exact files in the run directory that support the report.

## Audio Evidence Rules

Use these files when present:

- `metadata/audio-streams.json`: audio-probe output from ffprobe and extracted WAV locations.
- `metadata/audio-analysis.json`: non-AI signal analysis including silence, volume, loudness, RMS peaks, and optional librosa rhythm/spectrum.
- `metadata/speech-transcript.json`: local ASR provider selection, hardware evidence, model, status, and transcript segments.
- `metadata/audio-events.json`: local sound-event provider selection and skipped/completed status.
- `metadata/frame-quality.json`: FFmpeg-based frame quality filter decisions, rejected black/white/low-information frames, and replacement attempts.
- `output/audio-analysis.md`, `output/speech-transcript.md`, `output/audio-events.md`: human-readable summaries.
- `output/report-contract-check.json`: final report contract validation status.

Keep speech, visible text, and non-speech sound separate:

- ASR is for spoken or sung words.
- OCR is for visible on-screen text only.
- Non-speech sound analysis comes from audio signal analysis and optional sound-event models.
