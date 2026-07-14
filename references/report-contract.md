# Recreate Report Contract

Use this structure for `output/recreate-report.md`. Keep the report practical: another AI or creative operator should be able to recreate the source video from the report and intentionally modify selected parts.

## Required Sections

### 1. Source Inventory

- Input directory.
- Run directory.
- Video filenames.
- Duration, resolution, frame rate, codec, audio stream presence.
- Extraction mode and sampling parameters.

### 2. Executive Summary

- One-paragraph description of what the video is.
- Target audience and probable commercial/creative purpose.
- The most important visual and narrative features to preserve.

### 3. Timeline Reconstruction

Create a table with one row per meaningful shot or beat:

| Timecode | Visual content | Camera/framing | Motion/editing | Text/audio | Recreate notes |
| --- | --- | --- | --- | --- | --- |

Merge adjacent extracted frames only when they clearly belong to the same shot.

### 4. Visual DNA

Describe:

- Composition patterns.
- Lens/framing feel.
- Camera motion.
- Lighting and color palette.
- Set/location/product styling.
- Character or object continuity.
- Graphic overlays, captions, lower thirds, UI, typography, and logo placement.

### 5. Script Reconstruction

Write a remake script with:

- Scene number.
- Approximate timestamp range.
- Visual direction.
- Action.
- Voiceover/dialogue/caption text, using `[inaudible]` or `[not visible]` when uncertain.
- Transition to the next beat.

### 6. AI Recreation Prompt Pack

Provide:

- A master prompt preserving the video's format, subject, style, pacing, and camera language.
- Per-shot prompts for generation or editing.
- Negative prompts for visual artifacts to avoid.
- Continuity constraints for characters, products, logos, props, color, and location.

### 7. Modification Plan

Separate:

- Must preserve.
- Can modify.
- User-requested changes.
- Creative alternatives.

For each change, state which shots are affected and how to adjust prompts/scripts.

### 8. Gaps and QA

List anything that blocks a faithful recreation:

- Missing audio analysis.
- Sparse frames.
- Blurry or low-resolution frames.
- Fast motion not captured.
- Text too small to read.
- Legal/brand likeness constraints.

End with the exact files in the run directory that support the report.
