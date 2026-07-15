#!/usr/bin/env node
// Copyright (c) 2026 Yang Cao <cao.x.yang@gmail.com>
// SPDX-License-Identifier: MIT

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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

function pythonHasModule(moduleName) {
  const python = pythonCommand();
  if (!python) return false;
  return spawnSync(python, ["-c", `import ${moduleName}`], { encoding: "utf8" }).status === 0;
}

async function listWavs(runDir) {
  const audioDir = path.join(runDir, "audio");
  if (!existsSync(audioDir)) return [];
  const entries = await readdir(audioDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".wav"))
    .map((entry) => path.join(audioDir, entry.name))
    .sort();
}

function detectProviders() {
  return {
    yamnet: pythonHasModule("tensorflow") && pythonHasModule("tensorflow_hub"),
    panns: pythonHasModule("torch") && pythonHasModule("librosa"),
    clap: pythonHasModule("torch")
  };
}

function autoInstallEvents() {
  if (process.env.FFMPEG_SKILL_AUTO_INSTALL === "false") return { status: "skipped", reason: "auto_install_disabled" };
  const installer = path.join(scriptDir, "install-audio-support.mjs");
  if (!existsSync(installer)) return { status: "skipped", reason: "installer_missing" };
  const result = spawnSync(process.execPath, [installer, "--profile", "events"], {
    cwd: skillRoot,
    encoding: "utf8",
    maxBuffer: 200 * 1024 * 1024
  });
  return {
    status: result.status === 0 ? "completed" : "failed",
    stdout: result.status === 0 ? result.stdout.trim().slice(-4000) : "",
    stderr: result.status === 0 ? "" : result.stderr.trim().slice(-4000)
  };
}

async function runYamnet(wavs, runDir) {
  const python = pythonCommand();
  const outPath = path.join(runDir, "metadata", "yamnet-events.raw.json");
  const code = `
import csv
import json
import os
import sys
import urllib.request

import numpy as np
import tensorflow as tf
import tensorflow_hub as hub

out_path = sys.argv[1]
model_dir = sys.argv[2]
wavs = sys.argv[3:]
os.makedirs(model_dir, exist_ok=True)
class_map_path = os.path.join(model_dir, "yamnet_class_map.csv")
if not os.path.exists(class_map_path):
    urllib.request.urlretrieve(
        "https://raw.githubusercontent.com/tensorflow/models/master/research/audioset/yamnet/yamnet_class_map.csv",
        class_map_path,
    )
with open(class_map_path, encoding="utf-8") as f:
    class_names = [row["display_name"] for row in csv.DictReader(f)]
model = hub.load("https://tfhub.dev/google/yamnet/1")
items = []
for wav in wavs:
    audio_bytes = tf.io.read_file(wav)
    waveform, sample_rate = tf.audio.decode_wav(audio_bytes, desired_channels=1)
    waveform = tf.squeeze(waveform, axis=-1)
    scores, embeddings, spectrogram = model(waveform)
    scores_np = scores.numpy()
    mean_scores = scores_np.mean(axis=0)
    top_indexes = mean_scores.argsort()[-10:][::-1]
    top_labels = [{"name": class_names[int(i)], "score": float(mean_scores[int(i)])} for i in top_indexes]
    frame_events = []
    for frame_index, frame_scores in enumerate(scores_np):
        best = frame_scores.argsort()[-5:][::-1]
        labels = [{"name": class_names[int(i)], "score": float(frame_scores[int(i)])} for i in best if float(frame_scores[int(i)]) >= 0.10]
        if labels:
            start = frame_index * 0.48
            frame_events.append({"start": start, "end": start + 0.96, "labels": labels})
    items.append({
        "audio_file": wav,
        "top_labels": top_labels,
        "events": frame_events[:200],
        "frame_count": int(scores_np.shape[0]),
    })
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(items, f, ensure_ascii=False, indent=2)
`;
  const result = spawnSync(python, ["-c", code, outPath, path.join(skillRoot, ".models", "yamnet"), ...wavs], {
    encoding: "utf8",
    maxBuffer: 200 * 1024 * 1024
  });
  if (result.status !== 0) {
    return { status: "failed", stderr: result.stderr.trim(), items: [] };
  }
  const raw = JSON.parse(await readFile(outPath, "utf8"));
  return {
    status: "completed",
    provider_output: path.relative(runDir, outPath),
    items: raw.map((item) => ({
      audio_file: path.relative(runDir, item.audio_file),
      top_labels: item.top_labels,
      events: item.events,
      frame_count: item.frame_count
    }))
  };
}

function chooseProvider(requested, providers) {
  if (requested && requested !== "auto") return { selected: requested, reason: "user_requested" };
  if (providers.yamnet) return { selected: "yamnet", reason: "tensorflow_and_tensorflow_hub_detected" };
  if (providers.panns) return { selected: "panns", reason: "torch_and_librosa_detected" };
  if (providers.clap) return { selected: "clap", reason: "torch_detected_but_no_packaged_clap_runner" };
  return { selected: null, reason: "no_supported_local_audio_event_model_found" };
}

async function writeMarkdown(payload, runDir, language) {
  const isZh = language === "zh";
  const lines = [isZh ? "# 声音事件分析" : "# Audio Event Analysis", ""];
  lines.push(isZh ? `- Provider：${payload.providerSelection.selected || "无"}` : `- Provider: ${payload.providerSelection.selected || "none"}`);
  lines.push(isZh ? `- 状态：${payload.status}` : `- Status: ${payload.status}`);
  lines.push(isZh ? "- API：未使用，本地离线。" : "- API: not used; local-only.");
  lines.push("");
  if (payload.status !== "completed") {
    lines.push(isZh
      ? `未执行 AI 声音事件识别：${payload.providerSelection.reason}。仍可使用 output/audio-analysis.md 中的非 AI 音频信号分析。`
      : `AI audio event classification was not run: ${payload.providerSelection.reason}. Use output/audio-analysis.md for non-AI signal analysis.`);
  } else {
    for (const item of payload.events) {
      lines.push(`## ${item.audio_file}`);
      const labels = item.top_labels?.slice(0, 8).map((label) => `${label.name} (${label.score.toFixed(2)})`).join(", ") || "none";
      lines.push(isZh ? `- 主要声音标签：${labels}` : `- Top sound labels: ${labels}`);
      lines.push(isZh ? `- 事件窗口数：${item.events?.length || 0}` : `- Event windows: ${item.events?.length || 0}`);
      lines.push("");
    }
  }
  lines.push("");
  await writeFile(path.join(runDir, "output", "audio-events.md"), lines.join("\n"), "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runDir = args.run ? path.resolve(args.run) : null;
  const requestedProvider = String(args.provider || "auto");
  const language = String(args.language || "auto").toLowerCase().startsWith("zh") ? "zh" : "en";
  if (!runDir) {
    console.error("Usage: node scripts/classify-audio-events.mjs --run <run-dir> [--provider auto|yamnet|panns|clap|none]");
    process.exit(2);
  }
  await mkdir(path.join(runDir, "metadata"), { recursive: true });
  await mkdir(path.join(runDir, "output"), { recursive: true });

  const wavs = await listWavs(runDir);
  let providers = detectProviders();
  let choice = chooseProvider(requestedProvider, providers);
  let autoInstall = null;
  if (requestedProvider !== "none" && wavs.length && !providers.yamnet) {
    autoInstall = autoInstallEvents();
    providers = detectProviders();
    choice = chooseProvider(requestedProvider, providers);
  }
  if (requestedProvider === "none") choice = { selected: null, reason: "user_disabled_audio_event_ai" };
  const payload = {
    schema_version: "ffmpeg_video_recreator.audio_events.v1",
    created_at: new Date().toISOString(),
    localOnly: true,
    apiUsed: false,
    providerSelection: {
      requested: requestedProvider,
      selected: choice.selected,
      reason: wavs.length ? choice.reason : "no_extracted_audio_wav_found",
      detectedProviders: providers,
      autoInstall
    },
    status: "skipped",
    events: [],
    notes: [
      "This wrapper is intentionally local-only. API providers are not used.",
      "YAMNet runs locally when TensorFlow and TensorFlow Hub are available."
    ]
  };

  if (requestedProvider !== "none" && choice.selected === "yamnet" && wavs.length) {
    const yamnet = await runYamnet(wavs, runDir);
    payload.status = yamnet.status;
    payload.events = yamnet.items;
    payload.providerSelection.provider_output = yamnet.provider_output || null;
    if (yamnet.status !== "completed") {
      payload.providerSelection.reason = "yamnet_runner_failed";
      payload.providerSelection.error = yamnet.stderr;
    }
  } else if (requestedProvider !== "none" && choice.selected && wavs.length) {
    payload.status = "skipped";
    payload.providerSelection.reason = `${choice.selected}_runner_not_packaged`;
  }

  await writeFile(path.join(runDir, "metadata", "audio-events.json"), `${JSON.stringify(payload, null, 2)}\n`);
  await writeMarkdown(payload, runDir, language);
  console.log(JSON.stringify({
    status: payload.status,
    provider: payload.providerSelection.selected,
    outputs: ["metadata/audio-events.json", "output/audio-events.md"]
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
