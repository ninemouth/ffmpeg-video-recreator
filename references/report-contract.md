# Recreate Report Contract

Use this structure for `output/recreate-report.md`. Keep the report practical: another AI or creative operator should be able to recreate the source video from the report and intentionally modify selected parts.

Match the report language to the user's interaction language. If the user asks in Chinese, write the report, frame notes, script, and prompts in Chinese. If the user asks in English, write them in English. Do not default to English when the surrounding task is Chinese.

The final delivery is the complete `output/` directory, not only a contact sheet or report:

- `output/recreate-report.md`
- `output/keyframes/`
- `output/keyframes-index.md`
- `output/delivery-manifest.json`

## Required Sections

### 1. Source Inventory

- Input directory.
- Run directory.
- Video filenames.
- Duration, resolution, frame rate, codec, audio stream presence.
- Extraction mode and sampling parameters.
- Output keyframe directory.
- Keyframe index path.

### 2. Keyframe Deliverables

List the extracted keyframes as formal evidence assets:

| Video | Frame file | Approx. timecode | What it shows | Why it matters for recreation |
| --- | --- | --- | --- | --- |

Use `output/keyframes-index.md` and the individual image files as the source of truth. A contact sheet can help navigation, but it is not a substitute for individual keyframe deliverables.

### 3. Executive Summary

- One-paragraph description of what the video is.
- Target audience and probable commercial/creative purpose.
- The most important visual and narrative features to preserve.

### 4. Timeline Reconstruction

Create a table with one row per meaningful shot or beat:

| Timecode | Visual content | Camera/framing | Motion/editing | Text/audio | Recreate notes | Evidence frames |
| --- | --- | --- | --- | --- | --- | --- |

Merge adjacent extracted frames only when they clearly belong to the same shot.

### 5. Visual DNA

Describe:

- Composition patterns.
- Lens/framing feel.
- Camera motion.
- Lighting and color palette.
- Set/location/product styling.
- Character or object continuity.
- Graphic overlays, captions, lower thirds, UI, typography, and logo placement.

### 6. Script Reconstruction

Write a remake script with:

- Scene number.
- Approximate timestamp range.
- Visual direction.
- Action.
- Voiceover/dialogue/caption text, using `[inaudible]` or `[not visible]` when uncertain.
- Transition to the next beat.
- Evidence frame references.

### 7. AI Recreation Prompt Pack

Provide:

- A master prompt preserving the video's format, subject, style, pacing, and camera language.
- Per-shot prompts for generation or editing.
- Negative prompts for visual artifacts to avoid.
- Continuity constraints for characters, products, logos, props, color, and location.

### 8. Modification Plan

Separate:

- Must preserve.
- Can modify.
- User-requested changes.
- Creative alternatives.

For each change, state which shots are affected and how to adjust prompts/scripts.

### 9. Gaps and QA

List anything that blocks a faithful recreation:

- Missing audio analysis.
- Sparse frames.
- Blurry or low-resolution frames.
- Fast motion not captured.
- Text too small to read.
- Legal/brand likeness constraints.

End with the exact files in the run directory that support the report.
