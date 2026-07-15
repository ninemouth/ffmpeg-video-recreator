#!/usr/bin/env node
// Copyright (c) 2026 Yang Cao <cao.x.yang@gmail.com>
// SPDX-License-Identifier: MIT

import { spawn, spawnSync } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm", ".wmv", ".flv"]);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function requireCommand(command) {
  const probe = process.platform === "win32" ? "where" : "command";
  const args = process.platform === "win32" ? [command] : ["-v", command];
  const result = spawnSync(probe, args, { encoding: "utf8", shell: process.platform !== "win32" });
  if (result.status !== 0) {
    throw new Error(`${command} is missing. Run node scripts/install-ffmpeg.mjs --install`);
  }
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "video";
}

async function listVideos(inputDir) {
  const entries = await readdir(inputDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(inputDir, entry.name))
    .sort();
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited ${code}\n${stderr}`));
    });
  });
}

async function ffprobe(video) {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    video
  ]);
  return JSON.parse(stdout);
}

async function extract(video, outputPattern, mode, interval, sceneThreshold) {
  let vf;
  if (mode === "scene") {
    vf = `select='gt(scene,${sceneThreshold})',showinfo`;
  } else if (mode === "interval") {
    vf = `fps=1/${interval},showinfo`;
  } else {
    vf = `select='gt(scene,${sceneThreshold})+not(mod(t\\,${interval}))',showinfo`;
  }

  await run("ffmpeg", [
    "-hide_banner",
    "-y",
    "-i", video,
    "-vf", vf,
    "-vsync", "vfr",
    "-frame_pts", "1",
    outputPattern
  ]);
}

function technicalSummary(probe) {
  const video = probe.streams.find((stream) => stream.codec_type === "video") || {};
  const audio = probe.streams.find((stream) => stream.codec_type === "audio") || null;
  return {
    duration_seconds: Number(probe.format?.duration || video.duration || 0),
    size_bytes: Number(probe.format?.size || 0),
    width: video.width || null,
    height: video.height || null,
    frame_rate: video.avg_frame_rate || video.r_frame_rate || null,
    video_codec: video.codec_name || null,
    has_audio: Boolean(audio),
    audio_codec: audio?.codec_name || null
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = args.input ? path.resolve(args.input) : null;
  const runDir = args.run ? path.resolve(args.run) : null;
  const mode = args.mode || "hybrid";
  const interval = Number(args.interval || 2);
  const sceneThreshold = Number(args["scene-threshold"] || 0.32);
  const language = normalizeLanguage(args.language || "auto");
  const copyKeyframes = args["no-copy-keyframes"] !== true;
  const segmentFrames = Math.max(2, Number(args["segment-frames"] || 4));
  const analyzeAudio = args.audio !== "false" && args["no-audio"] !== true;
  const audioAi = args["audio-ai"] !== "false";

  if (!input || !runDir) {
    console.error("Usage: node scripts/extract-keyframes.mjs --input <video-dir> --run <run-dir> [--mode hybrid|scene|interval] [--language zh|en|auto]");
    process.exit(2);
  }
  if (!["hybrid", "scene", "interval"].includes(mode)) {
    throw new Error(`Unsupported mode: ${mode}`);
  }

  requireCommand("ffmpeg");
  requireCommand("ffprobe");

  const videos = await listVideos(input);
  if (videos.length === 0) throw new Error(`No supported videos found in ${input}`);

  await mkdir(path.join(runDir, "frames"), { recursive: true });
  await mkdir(path.join(runDir, "metadata"), { recursive: true });
  await mkdir(path.join(runDir, "output"), { recursive: true });
  await mkdir(path.join(runDir, "output", "keyframes"), { recursive: true });
  await mkdir(path.join(runDir, "output", "recreation-pack", "reference-keyframes"), { recursive: true });

  const frameIndex = [];
  const manifest = {
    input_directory: input,
    run_directory: runDir,
    extraction: {
      mode,
      interval_seconds: interval,
      scene_threshold: sceneThreshold,
      report_language: language,
      keyframes_copied_to_output: copyKeyframes,
      segment_frames: segmentFrames
    },
    videos: []
  };

  for (const video of videos) {
    const name = path.basename(video);
    const videoSlug = slugify(path.basename(video, path.extname(video)));
    const frameDir = path.join(runDir, "frames", videoSlug);
    await mkdir(frameDir, { recursive: true });

    const probe = await ffprobe(video);
    const metadata = technicalSummary(probe);
    await writeFile(path.join(runDir, "metadata", `${videoSlug}.ffprobe.json`), `${JSON.stringify(probe, null, 2)}\n`);

    const outputPattern = path.join(frameDir, "frame-%08d.jpg");
    await extract(video, outputPattern, mode, interval, sceneThreshold);

    const frames = (await readdir(frameDir))
      .filter((file) => file.toLowerCase().endsWith(".jpg"))
      .sort()
      .map((file, index) => {
        const frame = path.join("frames", videoSlug, file);
        const deliveryFrame = path.join("output", "keyframes", videoSlug, file);
        return {
          index: index + 1,
          file,
          frame,
          delivery_frame: copyKeyframes ? deliveryFrame : "",
          approx_timecode: approximateTimecode(index, mode, interval)
        };
      });

    const recreationKeyframeDir = path.join(runDir, "output", "recreation-pack", "reference-keyframes", videoSlug);
    await mkdir(recreationKeyframeDir, { recursive: true });
    if (copyKeyframes) {
      const deliveryDir = path.join(runDir, "output", "keyframes", videoSlug);
      await mkdir(deliveryDir, { recursive: true });
      for (const frame of frames) {
        await copyFile(path.join(runDir, frame.frame), path.join(runDir, frame.delivery_frame));
      }
    }
    for (const frame of frames) {
      await copyFile(path.join(runDir, frame.frame), path.join(recreationKeyframeDir, frame.file));
    }

    for (const frame of frames) {
      frameIndex.push({ video: name, video_slug: videoSlug, ...frame });
    }

    manifest.videos.push({
      file: name,
      path: video,
      frame_directory: path.relative(runDir, frameDir),
      delivery_keyframe_directory: copyKeyframes ? path.join("output", "keyframes", videoSlug) : "",
      frame_count: frames.length,
      metadata
    });
  }

  const manifestPath = path.join(runDir, "metadata", "manifest.json");
  let existing = {};
  try {
    existing = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    existing = {};
  }
  await writeFile(manifestPath, `${JSON.stringify({ ...existing, ...manifest, status: "keyframes_extracted", updated_at: new Date().toISOString() }, null, 2)}\n`);
  await writeFile(path.join(runDir, "metadata", "frame-index.json"), `${JSON.stringify(frameIndex, null, 2)}\n`);
  await writeFile(path.join(runDir, "output", "keyframes-index.md"), createKeyframeIndex(manifest, frameIndex, language), "utf8");
  await writeFile(path.join(runDir, "output", "delivery-manifest.json"), `${JSON.stringify(createDeliveryManifest(manifest, frameIndex), null, 2)}\n`);
  await writeFile(path.join(runDir, "output", "recreate-report.md"), createReportTemplate(manifest, language), "utf8");
  await writeRecreationPack(runDir, manifest, frameIndex, language, segmentFrames);
  const audioOutputs = analyzeAudio ? await runAudioPipeline(input, runDir, language, audioAi) : [];
  if (audioOutputs.length) {
    const deliveryManifest = createDeliveryManifest(manifest, frameIndex);
    deliveryManifest.deliverables.audio = {
      audio_streams: "metadata/audio-streams.json",
      audio_analysis: "metadata/audio-analysis.json",
      audio_analysis_report: "output/audio-analysis.md",
      speech_transcript: "metadata/speech-transcript.json",
      speech_transcript_report: "output/speech-transcript.md",
      audio_events: "metadata/audio-events.json",
      audio_events_report: "output/audio-events.md"
    };
    await writeFile(path.join(runDir, "output", "delivery-manifest.json"), `${JSON.stringify(deliveryManifest, null, 2)}\n`);
  }

  console.log(JSON.stringify({
    run_directory: runDir,
    videos: manifest.videos.length,
    frames: frameIndex.length,
    output_deliverables: [
      "output/recreate-report.md",
      "output/keyframes-index.md",
      "output/delivery-manifest.json",
      "output/recreation-pack/",
      "output/recreation-pack/segment-plan.md",
      "output/recreation-pack/continuity-locks.md",
      ...audioOutputs,
      copyKeyframes ? "output/keyframes/" : "frames/"
    ]
  }, null, 2));
}

async function runAudioPipeline(input, runDir, language, audioAi) {
  const outputs = [];
  const audioResult = await run(process.execPath, [
    path.join(path.dirname(fileURLToPath(import.meta.url)), "analyze-audio.mjs"),
    "--input", input,
    "--run", runDir,
    "--language", language
  ]);
  if (audioResult.stdout.trim()) console.error(audioResult.stdout.trim());
  outputs.push("metadata/audio-streams.json", "metadata/audio-analysis.json", "output/audio-analysis.md");

  if (audioAi) {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const transcriptResult = await run(process.execPath, [
      path.join(scriptDir, "transcribe-audio.mjs"),
      "--run", runDir,
      "--provider", "auto",
      "--model", "auto",
      "--quality", "balanced",
      "--language", language
    ]);
    if (transcriptResult.stdout.trim()) console.error(transcriptResult.stdout.trim());
    outputs.push("metadata/speech-transcript.json", "output/speech-transcript.md");

    const eventsResult = await run(process.execPath, [
      path.join(scriptDir, "classify-audio-events.mjs"),
      "--run", runDir,
      "--provider", "auto",
      "--language", language
    ]);
    if (eventsResult.stdout.trim()) console.error(eventsResult.stdout.trim());
    outputs.push("metadata/audio-events.json", "output/audio-events.md");
  }
  return outputs;
}

function normalizeLanguage(value) {
  const text = String(value || "auto").toLowerCase();
  if (["zh", "zh-cn", "cn", "chinese"].includes(text)) return "zh";
  if (["en", "en-us", "english"].includes(text)) return "en";
  return "auto";
}

function approximateTimecode(index, mode, interval) {
  if (mode === "scene") return "scene-change";
  const seconds = index * interval;
  const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const ss = String(Math.floor(seconds % 60)).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function createDeliveryManifest(manifest, frameIndex) {
  return {
    schema_version: "ffmpeg_video_recreator.delivery.v1",
    created_at: new Date().toISOString(),
    run_directory: manifest.run_directory,
    input_directory: manifest.input_directory,
    report_language: manifest.extraction.report_language,
    deliverables: {
      recreate_report: "output/recreate-report.md",
      keyframes_index: "output/keyframes-index.md",
      keyframes_directory: manifest.extraction.keyframes_copied_to_output ? "output/keyframes" : "frames",
      recreation_pack_directory: "output/recreation-pack",
      recreation_pack_manifest: "output/recreation-pack/recreation-manifest.json",
      segment_plan: "output/recreation-pack/segment-plan.md",
      continuity_locks: "output/recreation-pack/continuity-locks.md",
      segment_anchors_directory: "output/recreation-pack/segments",
      frame_index_json: "metadata/frame-index.json",
      manifest_json: "metadata/manifest.json",
      ffprobe_metadata_pattern: "metadata/*.ffprobe.json"
    },
    videos: manifest.videos,
    frame_count: frameIndex.length
  };
}

function createKeyframeIndex(manifest, frameIndex, language) {
  const isZh = language === "zh";
  const title = isZh ? "# 关键帧交付索引" : "# Keyframe Delivery Index";
  const note = isZh
    ? "这些关键帧是正式交付资产。报告中的镜头分析、复刻脚本和 AI 生成提示词都应引用这些帧作为证据。"
    : "These keyframes are formal delivery assets. The report's shot analysis, recreate script, and AI prompts should cite these frames as evidence.";
  const rows = frameIndex.map((frame) => `| ${frame.video} | ${frame.index} | ${frame.approx_timecode} | ${frame.delivery_frame || frame.frame} | |`).join("\n");
  const headers = isZh
    ? "| 视频 | 序号 | 近似时间码 | 交付文件 | 画面观察 |\n| --- | ---: | --- | --- | --- |"
    : "| Video | Index | Approx. timecode | Delivery file | Visual notes |\n| --- | ---: | --- | --- | --- |";
  return `${title}\n\n${note}\n\n${headers}\n${rows}\n`;
}

async function writeRecreationPack(runDir, manifest, frameIndex, language, segmentFrames) {
  const packDir = path.join(runDir, "output", "recreation-pack");
  const segments = createContinuitySegments(frameIndex, segmentFrames);
  await copySegmentAnchors(runDir, segments);
  const isZh = language === "zh";
  const files = isZh
    ? createChineseRecreationPackFiles(manifest, frameIndex, segments)
    : createEnglishRecreationPackFiles(manifest, frameIndex, segments);
  for (const [relativePath, content] of Object.entries(files)) {
    await writeFile(path.join(packDir, relativePath), content, "utf8");
  }
  await writeFile(path.join(packDir, "recreation-manifest.json"), `${JSON.stringify(createRecreationManifest(manifest, frameIndex, language, segments), null, 2)}\n`);
}

function createRecreationManifest(manifest, frameIndex, language, segments) {
  return {
    schema_version: "ffmpeg_video_recreator.recreation_pack.v1",
    created_at: new Date().toISOString(),
    language,
    purpose: "Portable package for recreating or modifying the source video with AI video tools.",
    source: {
      input_directory: manifest.input_directory,
      run_directory: manifest.run_directory,
      videos: manifest.videos
    },
    files: {
      readme: "README.md",
      recreation_brief: "recreation-brief.md",
      shot_list: "shot-list.md",
      prompts: "prompts.md",
      segment_plan: "segment-plan.md",
      continuity_locks: "continuity-locks.md",
      modification_plan: "modification-plan.md",
      reference_keyframes: "reference-keyframes/",
      segment_anchors: "segments/",
      source_report: "../recreate-report.md",
      source_keyframe_index: "../keyframes-index.md",
      source_delivery_manifest: "../delivery-manifest.json"
    },
    frame_count: frameIndex.length,
    reference_keyframes: frameIndex.map((frame) => ({
      video: frame.video,
      index: frame.index,
      approx_timecode: frame.approx_timecode,
      file: path.join("reference-keyframes", frame.video_slug, frame.file)
    })),
    segments
  };
}

function createContinuitySegments(frameIndex, segmentFrames) {
  const byVideo = new Map();
  for (const frame of frameIndex) {
    if (!byVideo.has(frame.video)) byVideo.set(frame.video, []);
    byVideo.get(frame.video).push(frame);
  }
  const segments = [];
  for (const [video, frames] of byVideo.entries()) {
    for (let start = 0; start < frames.length; start += segmentFrames) {
      const slice = frames.slice(start, start + segmentFrames);
      if (!slice.length) continue;
      const previous = segments.filter((segment) => segment.video === video).at(-1) || null;
      const segmentNumber = previous ? previous.segment_number + 1 : 1;
      const segmentId = `${slice[0].video_slug}-segment-${String(segmentNumber).padStart(3, "0")}`;
      const startFrame = slice[0];
      const endFrame = slice[slice.length - 1];
      segments.push({
        id: segmentId,
        video,
        video_slug: startFrame.video_slug,
        segment_number: segmentNumber,
        start_timecode: startFrame.approx_timecode,
        end_timecode: endFrame.approx_timecode,
        frame_indexes: slice.map((frame) => frame.index),
        reference_frames: slice.map((frame) => path.join("reference-keyframes", frame.video_slug, frame.file)),
        segment_folder: path.join("segments", segmentId),
        start_frame: path.join("segments", segmentId, "start-frame.jpg"),
        end_frame: path.join("segments", segmentId, "end-frame.jpg"),
        previous_end_frame: previous ? path.join("segments", segmentId, "previous-segment-end-frame.jpg") : "",
        continuity_anchor_from_previous_segment: previous ? previous.end_frame : "",
        prompt_control: previous
          ? "Use previous-segment-end-frame.jpg as the visual starting continuity anchor. Match subject identity, pose trajectory, lighting, camera angle, color palette, wardrobe/props, typography, and motion direction before introducing this segment's new action."
          : "Establish the source identity, scene, camera language, lighting, color palette, wardrobe/props, typography, and motion direction for later segments."
      });
    }
  }
  return segments;
}

async function copySegmentAnchors(runDir, segments) {
  for (const segment of segments) {
    const segmentDir = path.join(runDir, "output", "recreation-pack", segment.segment_folder);
    await mkdir(segmentDir, { recursive: true });
    const startSource = path.join(runDir, "output", "recreation-pack", segment.reference_frames[0]);
    const endSource = path.join(runDir, "output", "recreation-pack", segment.reference_frames.at(-1));
    await copyFile(startSource, path.join(runDir, "output", "recreation-pack", segment.start_frame));
    await copyFile(endSource, path.join(runDir, "output", "recreation-pack", segment.end_frame));
    if (segment.continuity_anchor_from_previous_segment) {
      await copyFile(
        path.join(runDir, "output", "recreation-pack", segment.continuity_anchor_from_previous_segment),
        path.join(runDir, "output", "recreation-pack", segment.previous_end_frame)
      );
    }
  }
}

function createEnglishRecreationPackFiles(manifest, frameIndex, segments) {
  const videoLines = manifest.videos.map((video) => `- ${video.file}: ${video.metadata.duration_seconds}s, ${video.metadata.width}x${video.metadata.height}, ${video.frame_count} reference frames`).join("\n");
  const frameRows = frameIndex.map((frame) => `| ${frame.video} | ${frame.index} | ${frame.approx_timecode} | reference-keyframes/${frame.video_slug}/${frame.file} | TODO |`).join("\n");
  const segmentRows = segments.map((segment) => `| ${segment.segment_number} | ${segment.video} | ${segment.start_timecode}-${segment.end_timecode} | ${segment.previous_end_frame || "N/A"} | ${segment.start_frame} | ${segment.end_frame} | TODO |`).join("\n");
  return {
    "README.md": `# Recreation Pack

This folder is the portable recreation package. It is intentionally smaller and cleaner than the full analysis workspace.

Use these files:

- \`recreation-brief.md\`: concise remake brief for AI video tools or human creators.
- \`shot-list.md\`: shot-by-shot reconstruction scaffold.
- \`segment-plan.md\`: segment-by-segment generation plan with start/end continuity anchors.
- \`prompts.md\`: master and per-shot prompt scaffold.
- \`continuity-locks.md\`: identity, scene, motion, style, and transition locks for multi-segment generation.
- \`modification-plan.md\`: preserve/change plan.
- \`reference-keyframes/\`: frame images to use as visual references.
- \`segments/\`: per-segment start/end frames and previous-segment anchor frames.
- \`recreation-manifest.json\`: machine-readable package inventory.

The full evidence set remains one level up in \`../keyframes/\`, \`../keyframes-index.md\`, and \`../recreate-report.md\`.
`,
    "recreation-brief.md": `# Recreation Brief

## Source

- Input directory: ${manifest.input_directory}
- Run directory: ${manifest.run_directory}
- Extraction mode: ${manifest.extraction.mode}
- Report language: ${manifest.extraction.report_language}

${videoLines}

## Recreate Goal

TODO: State the remake goal, target platform, duration, aspect ratio, and intended audience.

## Preserve

TODO: List the source video's must-preserve pacing, camera language, visual identity, subject continuity, and narrative beats.

## Change

TODO: List requested changes and where they apply.

## Reference Frames

Use \`reference-keyframes/\` as the visual input set for recreation.
`,
    "shot-list.md": `# Shot List

| Shot | Timecode | Visual direction | Camera/framing | Action | Text/audio | Reference frames |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | TODO | TODO | TODO | TODO | TODO | TODO |

## Frame Evidence

| Video | Frame | Approx. timecode | File | Notes |
| --- | ---: | --- | --- | --- |
${frameRows}
`,
    "segment-plan.md": `# Segment Generation Plan

AI video generation is usually done in short segments. Generate segments in order. For every segment after segment 1, use \`previous-segment-end-frame.jpg\` as the visual continuity anchor before following the new shot instructions.

| Segment | Video | Time range | Previous end anchor | Segment start frame | Segment end frame | Generation notes |
| ---: | --- | --- | --- | --- | --- | --- |
${segmentRows}

## Segment Rules

1. Segment 1 establishes identity, environment, lighting, camera language, color, wardrobe/props, typography, and movement direction.
2. Segment N must begin from the previous segment's end frame before evolving into its own action.
3. Preserve subject identity, scale, pose trajectory, camera angle, lens feel, color grade, lighting direction, wardrobe/props, logo/text placement, and motion direction across boundaries.
4. Only introduce requested changes at the segment where they are specified in \`modification-plan.md\`.
5. After generating each segment, compare its first frame against the previous segment's end frame and reject if identity, scene, or camera continuity breaks.
`,
    "prompts.md": `# AI Video Prompts

## Master Prompt

TODO: Write one master prompt that preserves format, visual style, pacing, camera language, lighting, color, subject continuity, segment boundary continuity, and narrative structure.

## Segment Prompt Template

Use this template for each generated segment:

\`\`\`text
Generate segment {segment_number} from {start_timecode} to {end_timecode}.
Reference frames: {segment_start_frame}, {segment_end_frame}.
For segment 2 and later, first match {previous_segment_end_frame} exactly as continuity context: subject identity, pose, camera angle, lighting, color, wardrobe/props, typography, background, motion direction.
Then continue into this segment's action: {segment_action}.
Maintain the same visual DNA and pacing as the source video.
Do not reset the scene, identity, camera, wardrobe, lighting, or text style at the segment boundary.
\`\`\`

## Per-Shot Prompts

### Shot 1

TODO: Include subject, scene, camera, action, lighting, style, duration, transition, and reference frame filenames.

## Negative Prompt

TODO: List artifacts to avoid, including inconsistent identity, extra limbs, incorrect text, logo drift, flicker, warped objects, and mismatched lighting.

## Continuity Constraints

TODO: List continuity constraints for characters, products, logos, props, color, wardrobe, location, and typography.
`,
    "continuity-locks.md": `# Continuity Locks

Use this file as the control layer for segmented AI video generation.

## Boundary Rule

Every segment after segment 1 must use the previous segment's end frame as its starting visual anchor. The first visible moment of the new segment should match the previous segment's final state before continuing motion.

## Lock These Across Segments

- Subject identity and physical proportions.
- Wardrobe, product details, props, logos, and text styling.
- Location, background geometry, and object positions unless the shot intentionally changes.
- Camera angle, lens feel, framing, motion direction, and movement speed.
- Lighting direction, contrast, color grade, texture, and exposure.
- Caption style, typography, placement, and animation rhythm.
- Narrative cause/effect between segment ending and next segment beginning.

## Boundary QA

For each segment boundary:

| Boundary | Previous end frame | Next start frame | Pass/fail | Repair prompt |
| --- | --- | --- | --- | --- |
${segments.filter((segment) => segment.previous_end_frame).map((segment) => `| ${segment.segment_number - 1} -> ${segment.segment_number} | ${segment.previous_end_frame} | ${segment.start_frame} | TODO | TODO |`).join("\n")}

If continuity fails, regenerate the later segment with a stricter instruction to match the previous end frame before adding new motion.
`,
    "modification-plan.md": `# Modification Plan

## Must Preserve

TODO: List elements that must stay close to the source.

## Can Modify

TODO: List safe creative changes.

## Requested Changes

TODO: Map each requested change to affected shots and prompt edits.

## QA Checks

TODO: Define how to check whether the recreation still matches the source structure.
`
  };
}

function createChineseRecreationPackFiles(manifest, frameIndex, segments) {
  const videoLines = manifest.videos.map((video) => `- ${video.file}: ${video.metadata.duration_seconds}s, ${video.metadata.width}x${video.metadata.height}, ${video.frame_count} 张参考帧`).join("\n");
  const frameRows = frameIndex.map((frame) => `| ${frame.video} | ${frame.index} | ${frame.approx_timecode} | reference-keyframes/${frame.video_slug}/${frame.file} | TODO |`).join("\n");
  const segmentRows = segments.map((segment) => `| ${segment.segment_number} | ${segment.video} | ${segment.start_timecode}-${segment.end_timecode} | ${segment.previous_end_frame || "无"} | ${segment.start_frame} | ${segment.end_frame} | TODO |`).join("\n");
  return {
    "README.md": `# 视频复刻独立包

这个目录是可独立交给 AI 视频工具或创作者使用的复刻包。它比完整分析工作区更干净，只保留复刻所需的核心材料。

使用这些文件：

- \`recreation-brief.md\`：复刻任务简报。
- \`shot-list.md\`：分镜/镜头清单。
- \`segment-plan.md\`：分段生成计划，包含起止帧和前段结束帧锚点。
- \`prompts.md\`：master prompt 和逐镜头 prompt。
- \`continuity-locks.md\`：多段生成时的身份、场景、运动、风格和边界连续性锁定规则。
- \`modification-plan.md\`：保留项、可修改项和用户修改要求。
- \`reference-keyframes/\`：用于复刻参考的关键帧图片。
- \`segments/\`：每段的起始帧、结束帧和上一段结束帧锚点。
- \`recreation-manifest.json\`：机器可读的复刻包清单。

完整证据集仍在上一级目录：\`../keyframes/\`、\`../keyframes-index.md\` 和 \`../recreate-report.md\`。
`,
    "recreation-brief.md": `# 复刻任务简报

## 来源

- 输入目录：${manifest.input_directory}
- 任务目录：${manifest.run_directory}
- 抽帧模式：${manifest.extraction.mode}
- 报告语言：${manifest.extraction.report_language}

${videoLines}

## 复刻目标

TODO：写明复刻目标、目标平台、时长、画幅比例、受众和使用场景。

## 必须保留

TODO：列出必须保留的节奏、镜头语言、视觉识别、主体连续性和叙事节拍。

## 需要修改

TODO：列出用户要求修改的内容，以及影响哪些镜头。

## 参考帧

使用 \`reference-keyframes/\` 作为复刻视觉输入集。
`,
    "shot-list.md": `# 分镜/镜头清单

| 镜头 | 时间码 | 画面指令 | 镜头/构图 | 动作 | 文字/音频 | 参考帧 |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | TODO | TODO | TODO | TODO | TODO | TODO |

## 关键帧证据

| 视频 | 帧序号 | 近似时间码 | 文件 | 备注 |
| --- | ---: | --- | --- | --- |
${frameRows}
`,
    "segment-plan.md": `# 分段生成计划

AI 视频通常需要分段生成。请按顺序生成每一段。第 2 段及之后的每一段，都必须先使用 \`previous-segment-end-frame.jpg\` 作为视觉连续性锚点，再进入本段动作。

| 段落 | 视频 | 时间范围 | 上一段结束帧锚点 | 本段起始帧 | 本段结束帧 | 生成备注 |
| ---: | --- | --- | --- | --- | --- | --- |
${segmentRows}

## 分段规则

1. 第 1 段建立人物/产品身份、环境、光线、镜头语言、色彩、服装/道具、字幕样式和运动方向。
2. 第 N 段必须先继承上一段结束帧的状态，再发展本段动作。
3. 跨段保持主体身份、比例、姿态轨迹、镜头角度、镜头质感、色彩、光线方向、服装/道具、Logo/文字位置和运动方向。
4. 只有在 \`modification-plan.md\` 指定的段落，才引入用户要求的改动。
5. 每段生成后，比较本段首帧与上一段尾帧；如果身份、场景或镜头连续性断裂，应重生成后段。
`,
    "prompts.md": `# AI 视频生成 Prompt

## Master Prompt

TODO：写一个总 prompt，保留原视频的格式、视觉风格、节奏、镜头语言、光线、色彩、主体连续性、分段边界连续性和叙事结构。

## 分段 Prompt 模板

每段生成时使用这个模板：

\`\`\`text
生成第 {segment_number} 段，时间范围 {start_timecode} 到 {end_timecode}。
参考帧：{segment_start_frame}、{segment_end_frame}。
第 2 段及之后，必须先精确匹配 {previous_segment_end_frame} 作为连续性上下文：主体身份、姿态、镜头角度、光线、色彩、服装/道具、字体、背景、运动方向。
然后继续进入本段动作：{segment_action}。
保持与原视频一致的视觉 DNA 和节奏。
不要在分段边界重置场景、身份、镜头、服装、光线或文字风格。
\`\`\`

## 逐镜头 Prompt

### 镜头 1

TODO：包含主体、场景、镜头、动作、光线、风格、时长、转场和参考帧文件名。

## Negative Prompt

TODO：列出需要避免的问题，例如身份不一致、多余肢体、错误文字、Logo 漂移、闪烁、物体变形、光线不匹配。

## 连续性约束

TODO：列出人物、产品、Logo、道具、色彩、服装、地点、字体和字幕的连续性要求。
`,
    "continuity-locks.md": `# 连续性锁定规则

这个文件是分段 AI 视频生成的控制层。

## 边界规则

第 1 段之后的每一段，都必须使用上一段结束帧作为起始视觉锚点。新段落的第一个可见状态应先匹配上一段最后状态，然后再继续运动。

## 跨段锁定项

- 主体身份和身体/产品比例。
- 服装、产品细节、道具、Logo 和文字样式。
- 地点、背景几何关系和物体位置，除非镜头明确切换。
- 镜头角度、镜头质感、构图、运动方向和运动速度。
- 光线方向、对比度、色彩风格、材质感和曝光。
- 字幕样式、字体、位置和动画节奏。
- 上一段结尾与下一段开头之间的叙事因果关系。

## 边界 QA

逐个检查分段边界：

| 边界 | 上一段结束帧 | 下一段起始帧 | 通过/失败 | 修复 prompt |
| --- | --- | --- | --- | --- |
${segments.filter((segment) => segment.previous_end_frame).map((segment) => `| ${segment.segment_number - 1} -> ${segment.segment_number} | ${segment.previous_end_frame} | ${segment.start_frame} | TODO | TODO |`).join("\n")}

如果连续性失败，重生成后段，并加强“先匹配上一段结束帧，再进入新动作”的提示。
`,
    "modification-plan.md": `# 修改方案

## 必须保留

TODO：列出必须贴近原视频的元素。

## 可以修改

TODO：列出安全的创意修改空间。

## 用户指定修改

TODO：把每项修改映射到受影响镜头和 prompt 改写方式。

## QA 检查

TODO：定义如何检查复刻结果仍然匹配原视频结构。
`
  };
}

function createReportTemplate(manifest, language) {
  if (language === "zh") return createChineseReportTemplate(manifest);
  const videoLines = manifest.videos.map((video) => `- ${video.file}: ${video.metadata.duration_seconds}s, ${video.metadata.width}x${video.metadata.height}, ${video.frame_count} frames`).join("\n");
  return `# Recreate Report

## 1. Source Inventory

- Input directory: ${manifest.input_directory}
- Run directory: ${manifest.run_directory}
- Extraction mode: ${manifest.extraction.mode}
- Interval seconds: ${manifest.extraction.interval_seconds}
- Scene threshold: ${manifest.extraction.scene_threshold}
- Report language: ${manifest.extraction.report_language === "auto" ? "Match the user's interaction language" : manifest.extraction.report_language}
- Keyframe delivery directory: output/keyframes/

${videoLines}

## 2. Executive Summary

TODO: Inspect the extracted frames and summarize the source video.

## 3. Timeline Reconstruction

| Timecode | Visual content | Camera/framing | Motion/editing | Text/audio | Recreate notes |
| --- | --- | --- | --- | --- | --- |
| TODO | TODO | TODO | TODO | TODO | TODO |

## 4. Visual DNA

TODO: Describe composition, lens/framing, motion, lighting, color, styling, overlays, typography, and continuity.

## 5. Script Reconstruction

TODO: Write scene-by-scene visual direction, action, voiceover/dialogue/captions, and transitions.

## 6. AI Recreation Prompt Pack

TODO: Provide master prompt, per-shot prompts, negative prompts, and continuity constraints.

## 7. Modification Plan

TODO: Separate must-preserve elements, editable elements, requested changes, and creative alternatives.

## 8. Gaps and QA

TODO: Note missing audio analysis, sparse frames, unreadable text, blur, fast motion, or legal/brand constraints.
`;
}

function createChineseReportTemplate(manifest) {
  const videoLines = manifest.videos.map((video) => `- ${video.file}: ${video.metadata.duration_seconds}s, ${video.metadata.width}x${video.metadata.height}, ${video.frame_count} 张关键帧`).join("\n");
  return `# 视频复刻创作报告

## 1. 源视频清单

- 输入目录：${manifest.input_directory}
- 任务目录：${manifest.run_directory}
- 抽帧模式：${manifest.extraction.mode}
- 抽帧间隔秒数：${manifest.extraction.interval_seconds}
- 场景变化阈值：${manifest.extraction.scene_threshold}
- 报告语言：中文
- 关键帧交付目录：output/keyframes/
- 关键帧索引：output/keyframes-index.md
- 交付清单：output/delivery-manifest.json

${videoLines}

## 2. 视频整体总结

TODO：查看关键帧和 metadata 后，用中文总结视频内容、目标受众、商业/创作用途，以及复刻时最需要保留的元素。

## 3. 关键帧证据清单

TODO：引用 output/keyframes-index.md 中的关键帧，说明每组关键帧对应的镜头、动作、构图、字幕、产品或人物变化。

## 4. 时间线与镜头拆解

| 时间码 | 画面内容 | 镜头/构图 | 运动/剪辑 | 文字/音频 | 复刻要点 | 证据帧 |
| --- | --- | --- | --- | --- | --- | --- |
| TODO | TODO | TODO | TODO | TODO | TODO | TODO |

## 5. 视觉 DNA

TODO：描述构图规律、镜头语言、运动方式、光线、色彩、场景/产品陈列、人物或物体连续性、字幕/图形/Logo/排版风格。

## 6. 剧本与分镜脚本复原

TODO：按场景编号写出时间范围、画面指令、动作、旁白/对白/字幕、转场方式。无法确认的内容标注为「无法确认」或「画面不可读」。

## 7. AI 视频复刻 Prompt 包

TODO：提供 master prompt、逐镜头 prompt、negative prompt，以及人物/产品/Logo/道具/色彩/场景连续性约束。

## 8. 修改方案

TODO：分开列出必须保留、可以修改、用户要求修改、可替代创意。每项修改都说明影响哪些镜头以及如何调整 prompt/脚本。

## 9. 缺口与 QA 风险

TODO：记录缺失音频转写、关键帧不足、画面模糊、文字不可读、快速运动未捕捉、品牌/肖像/版权风险等问题。
`;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
