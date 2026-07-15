#!/usr/bin/env node
// Copyright (c) 2026 Yang Cao <cao.x.yang@gmail.com>
// SPDX-License-Identifier: MIT

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm", ".wmv", ".flv"]);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "..");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function commandExists(command) {
  const probe = process.platform === "win32" ? "where" : "command";
  const args = process.platform === "win32" ? [command] : ["-v", command];
  return spawnSync(probe, args, { encoding: "utf8", shell: process.platform !== "win32" }).status === 0;
}

function requireCommand(command) {
  if (!commandExists(command)) {
    throw new Error(`${command} is missing. Run node scripts/install-ffmpeg.mjs --install`);
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 || options.allowFailure) resolve({ code, stdout, stderr });
      else reject(new Error(`${command} exited ${code}\n${stderr}`));
    });
  });
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "video";
}

async function listVideos(inputDir) {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(inputDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(inputDir, entry.name))
    .sort();
}

async function ffprobe(file) {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    file
  ]);
  return JSON.parse(stdout);
}

function audioStreamsFromProbe(probe) {
  return (probe.streams || [])
    .filter((stream) => stream.codec_type === "audio")
    .map((stream) => ({
      index: stream.index,
      codec_name: stream.codec_name || null,
      codec_long_name: stream.codec_long_name || null,
      sample_rate: stream.sample_rate ? Number(stream.sample_rate) : null,
      channels: stream.channels || null,
      channel_layout: stream.channel_layout || null,
      duration_seconds: stream.duration ? Number(stream.duration) : null,
      bit_rate: stream.bit_rate ? Number(stream.bit_rate) : null,
      language: stream.tags?.language || null
    }));
}

async function extractWav(video, audioPath, streamIndex = 0) {
  await mkdir(path.dirname(audioPath), { recursive: true });
  await run("ffmpeg", [
    "-hide_banner",
    "-y",
    "-i", video,
    "-map", `0:a:${streamIndex}`,
    "-vn",
    "-ac", "1",
    "-ar", "16000",
    "-c:a", "pcm_s16le",
    audioPath
  ]);
}

async function runSilenceDetect(audioPath) {
  const result = await run("ffmpeg", [
    "-hide_banner",
    "-i", audioPath,
    "-af", "silencedetect=noise=-35dB:d=0.35",
    "-f", "null",
    "-"
  ], { allowFailure: true });
  const segments = [];
  let current = null;
  for (const line of result.stderr.split(/\r?\n/)) {
    const start = line.match(/silence_start:\s*([0-9.]+)/);
    if (start) current = { start: Number(start[1]), end: null, duration: null };
    const end = line.match(/silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/);
    if (end) {
      segments.push({
        start: current?.start ?? null,
        end: Number(end[1]),
        duration: Number(end[2])
      });
      current = null;
    }
  }
  return segments;
}

async function runVolumeDetect(audioPath) {
  const result = await run("ffmpeg", [
    "-hide_banner",
    "-i", audioPath,
    "-af", "volumedetect",
    "-f", "null",
    "-"
  ], { allowFailure: true });
  return {
    mean_volume_db: numberAfter(result.stderr, /mean_volume:\s*(-?[0-9.]+)\s*dB/),
    max_volume_db: numberAfter(result.stderr, /max_volume:\s*(-?[0-9.]+)\s*dB/),
    histogram: parseVolumeHistogram(result.stderr)
  };
}

async function runAstats(audioPath, curvePath) {
  await mkdir(path.dirname(curvePath), { recursive: true });
  const result = await run("ffmpeg", [
    "-hide_banner",
    "-i", audioPath,
    "-af", `astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=${curvePath}`,
    "-f", "null",
    "-"
  ], { allowFailure: true });

  let curve = [];
  if (existsSync(curvePath)) {
    const raw = await readFile(curvePath, "utf8");
    curve = parseAstatsCurve(raw);
    await writeFile(curvePath, toCsv(curve), "utf8");
  }

  return {
    overall: {
      dc_offset: numberAfter(result.stderr, /DC offset:\s*(-?[0-9.]+)/),
      min_level: numberAfter(result.stderr, /Min level:\s*(-?[0-9.]+)/),
      max_level: numberAfter(result.stderr, /Max level:\s*(-?[0-9.]+)/),
      peak_level_db: numberAfter(result.stderr, /Peak level dB:\s*(-?[0-9.]+)/),
      rms_level_db: numberAfter(result.stderr, /RMS level dB:\s*(-?[0-9.]+)/),
      rms_peak_db: numberAfter(result.stderr, /RMS peak dB:\s*(-?[0-9.]+)/),
      rms_trough_db: numberAfter(result.stderr, /RMS trough dB:\s*(-?[0-9.]+)/),
      crest_factor: numberAfter(result.stderr, /Crest factor:\s*(-?[0-9.]+)/),
      zero_crossings: numberAfter(result.stderr, /Zero crossings:\s*([0-9.]+)/),
      zero_crossings_rate: numberAfter(result.stderr, /Zero crossings rate:\s*([0-9.]+)/)
    },
    rms_curve_csv: path.basename(curvePath),
    rms_curve_points: curve.length,
    energy_peaks: detectEnergyPeaks(curve)
  };
}

async function runEbur128(audioPath) {
  const result = await run("ffmpeg", [
    "-hide_banner",
    "-nostats",
    "-i", audioPath,
    "-filter_complex", "ebur128=peak=true",
    "-f", "null",
    "-"
  ], { allowFailure: true });
  return {
    integrated_loudness_lufs: numberAfter(result.stderr, /I:\s*(-?[0-9.]+)\s*LUFS/),
    loudness_range_lu: numberAfter(result.stderr, /LRA:\s*([0-9.]+)\s*LU/),
    true_peak_dbfs: numberAfter(result.stderr, /Peak:\s*(-?[0-9.]+)\s*dBFS/)
  };
}

async function runLibrosaOptional(audioPath) {
  const python = pythonCommand();
  if (!python) return skipped("python_not_found");
  const probe = spawnSync(python, ["-c", "import librosa, json"], { encoding: "utf8" });
  if (probe.status !== 0) return skipped("librosa_not_installed");

  const code = `
import json, sys
import librosa
audio_path = sys.argv[1]
y, sr = librosa.load(audio_path, sr=None, mono=True)
tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
centroid = librosa.feature.spectral_centroid(y=y, sr=sr)
bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr)
rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)
zcr = librosa.feature.zero_crossing_rate(y)
print(json.dumps({
  "status": "completed",
  "tempo_bpm": float(tempo[0] if hasattr(tempo, "__len__") else tempo),
  "beat_count": int(len(beats)),
  "spectral_centroid_mean": float(centroid.mean()),
  "spectral_bandwidth_mean": float(bandwidth.mean()),
  "spectral_rolloff_mean": float(rolloff.mean()),
  "zero_crossing_rate_mean": float(zcr.mean())
}, ensure_ascii=False))
`;
  const result = spawnSync(python, ["-c", code, audioPath], { encoding: "utf8", maxBuffer: 1024 * 1024 * 20 });
  if (result.status !== 0) return skipped("librosa_failed", result.stderr.trim());
  return JSON.parse(result.stdout);
}

function pythonCommand() {
  if (process.env.FFMPEG_SKILL_AUDIO_PYTHON && existsSync(process.env.FFMPEG_SKILL_AUDIO_PYTHON)) {
    return process.env.FFMPEG_SKILL_AUDIO_PYTHON;
  }
  const local = process.platform === "win32"
    ? path.join(skillRoot, ".venv-audio", "Scripts", "python.exe")
    : path.join(skillRoot, ".venv-audio", "bin", "python");
  if (existsSync(local)) return local;
  return ["python3", "python"].find(commandExists) || null;
}

function numberAfter(text, regex) {
  const match = text.match(regex);
  return match ? Number(match[1]) : null;
}

function parseVolumeHistogram(text) {
  const histogram = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/histogram_(-?[0-9]+)db:\s*([0-9]+)/);
    if (match) histogram[`${match[1]}db`] = Number(match[2]);
  }
  return histogram;
}

function parseAstatsCurve(raw) {
  const points = [];
  let ptsTime = null;
  for (const line of raw.split(/\r?\n/)) {
    const time = line.match(/pts_time:([0-9.]+)/);
    if (time) ptsTime = Number(time[1]);
    const value = line.match(/lavfi\.astats\.Overall\.RMS_level=(-?[0-9.]+)/);
    if (value && ptsTime !== null) points.push({ time: ptsTime, rms_db: Number(value[1]) });
  }
  return points;
}

function toCsv(points) {
  return `time_seconds,rms_db\n${points.map((point) => `${point.time},${point.rms_db}`).join("\n")}\n`;
}

function detectEnergyPeaks(points) {
  if (points.length < 3) return [];
  const values = points.map((point) => point.rms_db).filter(Number.isFinite);
  const sorted = [...values].sort((a, b) => a - b);
  const threshold = sorted[Math.floor(sorted.length * 0.85)] ?? -20;
  const peaks = [];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1].rms_db;
    const curr = points[i].rms_db;
    const next = points[i + 1].rms_db;
    if (curr >= threshold && curr >= prev && curr >= next) {
      if (!peaks.length || curr - peaks.at(-1).rms_db > 3 || points[i].time - peaks.at(-1).time > 0.75) {
        peaks.push({ time: points[i].time, rms_db: curr });
      }
    }
  }
  return peaks.slice(0, 50);
}

function skipped(reason, detail = "") {
  return { status: "skipped", reason, detail };
}

function createMarkdown(results, language) {
  const isZh = language === "zh";
  const title = isZh ? "# 音频分析" : "# Audio Analysis";
  const lines = [title, ""];
  for (const item of results.files) {
    lines.push(isZh ? `## ${item.source_file}` : `## ${item.source_file}`);
    if (!item.has_audio) {
      lines.push(isZh ? "- 未检测到音频轨。" : "- No audio stream detected.");
      lines.push("");
      continue;
    }
    lines.push(isZh ? `- 音频轨数量：${item.audio_streams.length}` : `- Audio streams: ${item.audio_streams.length}`);
    lines.push(isZh ? `- 提取 WAV：${item.extracted_wav}` : `- Extracted WAV: ${item.extracted_wav}`);
    lines.push(isZh ? `- 平均音量：${item.signal.volume.mean_volume_db ?? "unknown"} dB` : `- Mean volume: ${item.signal.volume.mean_volume_db ?? "unknown"} dB`);
    lines.push(isZh ? `- 最大音量：${item.signal.volume.max_volume_db ?? "unknown"} dB` : `- Max volume: ${item.signal.volume.max_volume_db ?? "unknown"} dB`);
    lines.push(isZh ? `- 静音片段：${item.signal.silence_segments.length}` : `- Silence segments: ${item.signal.silence_segments.length}`);
    lines.push(isZh ? `- 能量峰值：${item.signal.astats.energy_peaks.length}` : `- Energy peaks: ${item.signal.astats.energy_peaks.length}`);
    lines.push(isZh ? `- Librosa 节奏/频谱：${item.signal.librosa.status}` : `- Librosa tempo/spectrum: ${item.signal.librosa.status}`);
    lines.push("");
  }
  lines.push(isZh
    ? "说明：这是本地非 AI 音频信号分析，不包含语音转写，也不识别具体声音事件。"
    : "Note: this is local non-AI audio signal analysis. It does not transcribe speech or identify semantic sound events.");
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = args.input ? path.resolve(args.input) : null;
  const runDir = args.run ? path.resolve(args.run) : null;
  const language = String(args.language || "auto").toLowerCase().startsWith("zh") ? "zh" : "en";
  if (!input || !runDir) {
    console.error("Usage: node scripts/analyze-audio.mjs --input <video-dir> --run <run-dir> [--language zh|en]");
    process.exit(2);
  }

  requireCommand("ffmpeg");
  requireCommand("ffprobe");
  const videos = await listVideos(input);
  await mkdir(path.join(runDir, "audio"), { recursive: true });
  await mkdir(path.join(runDir, "metadata"), { recursive: true });
  await mkdir(path.join(runDir, "output"), { recursive: true });

  const results = {
    schema_version: "ffmpeg_video_recreator.audio_analysis.v1",
    created_at: new Date().toISOString(),
    input_directory: input,
    run_directory: runDir,
    local_only: true,
    api_used: false,
    files: []
  };

  for (const video of videos) {
    const sourceFile = path.basename(video);
    const videoSlug = slugify(path.basename(video, path.extname(video)));
    const probe = await ffprobe(video);
    const audioStreams = audioStreamsFromProbe(probe);
    const item = {
      source_file: sourceFile,
      source_path: video,
      has_audio: audioStreams.length > 0,
      audio_streams: audioStreams,
      extracted_wav: null,
      signal: null
    };
    if (audioStreams.length > 0) {
      const wavRel = path.join("audio", `${videoSlug}.wav`);
      const wavPath = path.join(runDir, wavRel);
      await extractWav(video, wavPath, 0);
      const curveRel = path.join("metadata", `${videoSlug}.rms-curve.csv`);
      item.extracted_wav = wavRel;
      item.signal = {
        silence_segments: await runSilenceDetect(wavPath),
        volume: await runVolumeDetect(wavPath),
        loudness: await runEbur128(wavPath),
        astats: await runAstats(wavPath, path.join(runDir, curveRel)),
        librosa: await runLibrosaOptional(wavPath)
      };
    }
    results.files.push(item);
  }

  await writeFile(path.join(runDir, "metadata", "audio-streams.json"), `${JSON.stringify(results.files.map((file) => ({
    source_file: file.source_file,
    source_path: file.source_path,
    has_audio: file.has_audio,
    audio_streams: file.audio_streams,
    extracted_wav: file.extracted_wav
  })), null, 2)}\n`);
  await writeFile(path.join(runDir, "metadata", "audio-analysis.json"), `${JSON.stringify(results, null, 2)}\n`);
  await writeFile(path.join(runDir, "output", "audio-analysis.md"), createMarkdown(results, language), "utf8");

  console.log(JSON.stringify({
    status: "completed",
    analyzed_files: results.files.length,
    files_with_audio: results.files.filter((file) => file.has_audio).length,
    outputs: [
      "metadata/audio-streams.json",
      "metadata/audio-analysis.json",
      "output/audio-analysis.md"
    ]
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
