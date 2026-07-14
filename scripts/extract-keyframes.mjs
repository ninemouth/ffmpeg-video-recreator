#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

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

  if (!input || !runDir) {
    console.error("Usage: node scripts/extract-keyframes.mjs --input <video-dir> --run <run-dir> [--mode hybrid|scene|interval]");
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

  const frameIndex = [];
  const manifest = {
    input_directory: input,
    run_directory: runDir,
    extraction: { mode, interval_seconds: interval, scene_threshold: sceneThreshold },
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
      .map((file) => path.join("frames", videoSlug, file));

    for (const frame of frames) {
      frameIndex.push({ video: name, frame });
    }

    manifest.videos.push({ file: name, path: video, frame_directory: path.relative(runDir, frameDir), frame_count: frames.length, metadata });
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
  await writeFile(path.join(runDir, "output", "recreate-report.md"), createReportTemplate(manifest), "utf8");

  console.log(JSON.stringify({ run_directory: runDir, videos: manifest.videos.length, frames: frameIndex.length }, null, 2));
}

function createReportTemplate(manifest) {
  const videoLines = manifest.videos.map((video) => `- ${video.file}: ${video.metadata.duration_seconds}s, ${video.metadata.width}x${video.metadata.height}, ${video.frame_count} frames`).join("\n");
  return `# Recreate Report

## 1. Source Inventory

- Input directory: ${manifest.input_directory}
- Run directory: ${manifest.run_directory}
- Extraction mode: ${manifest.extraction.mode}
- Interval seconds: ${manifest.extraction.interval_seconds}
- Scene threshold: ${manifest.extraction.scene_threshold}

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

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
