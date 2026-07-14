#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
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
  const language = normalizeLanguage(args.language || "auto");
  const copyKeyframes = args["no-copy-keyframes"] !== true;

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

  const frameIndex = [];
  const manifest = {
    input_directory: input,
    run_directory: runDir,
    extraction: { mode, interval_seconds: interval, scene_threshold: sceneThreshold, report_language: language, keyframes_copied_to_output: copyKeyframes },
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

    if (copyKeyframes) {
      const deliveryDir = path.join(runDir, "output", "keyframes", videoSlug);
      await mkdir(deliveryDir, { recursive: true });
      for (const frame of frames) {
        await copyFile(path.join(runDir, frame.frame), path.join(runDir, frame.delivery_frame));
      }
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

  console.log(JSON.stringify({
    run_directory: runDir,
    videos: manifest.videos.length,
    frames: frameIndex.length,
    output_deliverables: [
      "output/recreate-report.md",
      "output/keyframes-index.md",
      "output/delivery-manifest.json",
      copyKeyframes ? "output/keyframes/" : "frames/"
    ]
  }, null, 2));
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
