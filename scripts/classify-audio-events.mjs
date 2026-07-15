#!/usr/bin/env node
// Copyright (c) 2026 Yang Cao <cao.x.yang@gmail.com>
// SPDX-License-Identifier: MIT

import { readdir, writeFile, mkdir } from "node:fs/promises";
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
  const providers = detectProviders();
  let choice = chooseProvider(requestedProvider, providers);
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
      detectedProviders: providers
    },
    status: "skipped",
    events: [],
    notes: [
      "This wrapper is intentionally local-only. API providers are not used.",
      "YAMNet/PANNs/CLAP execution is skipped unless a local runner is installed and explicitly wired."
    ]
  };

  if (requestedProvider !== "none" && choice.selected && wavs.length) {
    payload.status = "skipped";
    payload.providerSelection.reason = `${choice.selected}_detected_but_runner_not_packaged`;
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
