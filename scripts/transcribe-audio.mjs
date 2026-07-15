#!/usr/bin/env node
// Copyright (c) 2026 Yang Cao <cao.x.yang@gmail.com>
// SPDX-License-Identifier: MIT

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

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

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 100,
    ...options
  });
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

function detectHardware() {
  const nvidia = commandExists("nvidia-smi")
    ? run("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader"], { shell: false })
    : null;
  const hasNvidia = Boolean(nvidia && nvidia.status === 0);
  return {
    platform: process.platform,
    arch: process.arch,
    apple_silicon: process.platform === "darwin" && process.arch === "arm64",
    nvidia_cuda: hasNvidia,
    nvidia_gpus: hasNvidia ? nvidia.stdout.trim().split(/\r?\n/).filter(Boolean) : []
  };
}

function pythonCommand() {
  return ["python3", "python"].find(commandExists) || null;
}

function pythonHasModule(moduleName) {
  const python = pythonCommand();
  if (!python) return false;
  return run(python, ["-c", `import ${moduleName}`]).status === 0;
}

function detectProviders(hardware) {
  return {
    whisper_cpp: ["whisper-cli", "whisper-cpp", "main"].find(commandExists) || null,
    faster_whisper: pythonHasModule("faster_whisper"),
    openai_whisper: pythonHasModule("whisper"),
    qwen3_asr: pythonHasModule("qwen_asr") || pythonHasModule("transformers"),
    hardware
  };
}

function chooseProvider(requested, providers, hardware) {
  if (requested && requested !== "auto") {
    return { selected: requested, reason: "user_requested" };
  }
  if (hardware.nvidia_cuda && providers.faster_whisper) {
    return { selected: "faster-whisper", reason: "nvidia_cuda_available_and_faster_whisper_installed" };
  }
  if (hardware.nvidia_cuda && providers.qwen3_asr) {
    return { selected: "qwen3-asr", reason: "nvidia_cuda_available_and_qwen3_asr_runtime_detected" };
  }
  if (providers.whisper_cpp) {
    return { selected: "whisper.cpp", reason: hardware.apple_silicon ? "apple_silicon_prefers_whisper_cpp" : "whisper_cpp_available" };
  }
  if (providers.faster_whisper) {
    return { selected: "faster-whisper", reason: "faster_whisper_cpu_available" };
  }
  if (providers.openai_whisper) {
    return { selected: "openai-whisper", reason: "openai_whisper_python_available" };
  }
  return { selected: null, reason: "no_supported_local_asr_provider_found" };
}

function defaultModel(provider, quality, hardware) {
  if (provider === "whisper.cpp") return process.env.WHISPER_CPP_MODEL || (quality === "low" ? "base" : "small");
  if (provider === "qwen3-asr") return quality === "best" ? "Qwen/Qwen3-ASR-1.7B" : "Qwen/Qwen3-ASR-0.6B";
  if (hardware.nvidia_cuda && ["quality", "best"].includes(quality)) return "large-v3";
  if (hardware.apple_silicon && ["quality", "best"].includes(quality)) return "medium";
  if (quality === "low") return "base";
  if (quality === "quality" || quality === "best") return "medium";
  return "small";
}

function whisperCppModelUsable(model) {
  return Boolean(model && existsSync(path.resolve(model)));
}

async function transcribeWhisperCpp(command, wavs, runDir, model) {
  const results = [];
  for (const wav of wavs) {
    const stem = path.basename(wav, ".wav");
    const outputPrefix = path.join(runDir, "metadata", `${stem}.whisper-cpp`);
    const args = ["-m", model, "-f", wav, "-oj", "-of", outputPrefix];
    const result = run(command, args);
    const jsonPath = `${outputPrefix}.json`;
    results.push({
      audio_file: path.relative(runDir, wav),
      status: result.status === 0 && existsSync(jsonPath) ? "completed" : "failed",
      provider_output: existsSync(jsonPath) ? path.relative(runDir, jsonPath) : null,
      stderr: result.status === 0 ? "" : result.stderr.trim()
    });
  }
  return results;
}

async function transcribeFasterWhisper(wavs, runDir, model) {
  const python = pythonCommand();
  const code = `
import json, sys
from faster_whisper import WhisperModel
model_name = sys.argv[1]
out_path = sys.argv[2]
wavs = sys.argv[3:]
model = WhisperModel(model_name, device="auto", compute_type="auto")
items = []
for wav in wavs:
    segments, info = model.transcribe(wav, vad_filter=True)
    segs = [{"start": float(s.start), "end": float(s.end), "text": s.text.strip()} for s in segments]
    items.append({"audio_file": wav, "language": info.language, "language_probability": float(info.language_probability), "segments": segs})
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(items, f, ensure_ascii=False, indent=2)
`;
  const outPath = path.join(runDir, "metadata", "faster-whisper-transcript.raw.json");
  const result = run(python, ["-c", code, model, outPath, ...wavs]);
  if (result.status !== 0) {
    return wavs.map((wav) => ({ audio_file: path.relative(runDir, wav), status: "failed", stderr: result.stderr.trim() }));
  }
  const raw = JSON.parse(await readFile(outPath, "utf8"));
  return raw.map((item) => ({
    audio_file: path.relative(runDir, item.audio_file),
    status: "completed",
    language: item.language,
    language_probability: item.language_probability,
    segments: item.segments
  }));
}

async function transcribeOpenAIWhisper(wavs, runDir, model) {
  const python = pythonCommand();
  const code = `
import json, sys, whisper
model_name = sys.argv[1]
out_path = sys.argv[2]
wavs = sys.argv[3:]
model = whisper.load_model(model_name)
items = []
for wav in wavs:
    result = model.transcribe(wav)
    items.append({"audio_file": wav, "language": result.get("language"), "segments": [{"start": float(s["start"]), "end": float(s["end"]), "text": s["text"].strip()} for s in result.get("segments", [])]})
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(items, f, ensure_ascii=False, indent=2)
`;
  const outPath = path.join(runDir, "metadata", "openai-whisper-transcript.raw.json");
  const result = run(python, ["-c", code, model, outPath, ...wavs]);
  if (result.status !== 0) {
    return wavs.map((wav) => ({ audio_file: path.relative(runDir, wav), status: "failed", stderr: result.stderr.trim() }));
  }
  const raw = JSON.parse(await readFile(outPath, "utf8"));
  return raw.map((item) => ({ audio_file: path.relative(runDir, item.audio_file), status: "completed", language: item.language, segments: item.segments }));
}

async function transcribeQwen3Asr(wavs, runDir, model) {
  const python = pythonCommand();
  const code = `
import json, sys
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline
import torch
model_name = sys.argv[1]
out_path = sys.argv[2]
wavs = sys.argv[3:]
device = "cuda:0" if torch.cuda.is_available() else "cpu"
dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32
model = AutoModelForSpeechSeq2Seq.from_pretrained(model_name, torch_dtype=dtype, low_cpu_mem_usage=True, trust_remote_code=True)
model.to(device)
processor = AutoProcessor.from_pretrained(model_name, trust_remote_code=True)
pipe = pipeline("automatic-speech-recognition", model=model, tokenizer=processor.tokenizer, feature_extractor=processor.feature_extractor, torch_dtype=dtype, device=device)
items = []
for wav in wavs:
    result = pipe(wav)
    items.append({"audio_file": wav, "text": result.get("text", "")})
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(items, f, ensure_ascii=False, indent=2)
`;
  const outPath = path.join(runDir, "metadata", "qwen3-asr-transcript.raw.json");
  const result = run(python, ["-c", code, model, outPath, ...wavs]);
  if (result.status !== 0) {
    return wavs.map((wav) => ({ audio_file: path.relative(runDir, wav), status: "failed", stderr: result.stderr.trim() }));
  }
  const raw = JSON.parse(await readFile(outPath, "utf8"));
  return raw.map((item) => ({ audio_file: path.relative(runDir, item.audio_file), status: "completed", text: item.text }));
}

function transcriptMarkdown(payload, language) {
  const isZh = language === "zh";
  const lines = [isZh ? "# 语音转写" : "# Speech Transcript", ""];
  lines.push(isZh ? `- Provider：${payload.providerSelection.selected || "无"}` : `- Provider: ${payload.providerSelection.selected || "none"}`);
  lines.push(isZh ? `- 状态：${payload.status}` : `- Status: ${payload.status}`);
  lines.push(isZh ? "- API：未使用，本地离线。" : "- API: not used; local-only.");
  lines.push("");
  if (payload.status !== "completed") {
    lines.push(isZh ? `跳过原因：${payload.providerSelection.reason}` : `Skip reason: ${payload.providerSelection.reason}`);
    lines.push("");
    return lines.join("\n");
  }
  for (const item of payload.transcripts) {
    lines.push(`## ${item.audio_file}`);
    if (item.segments) {
      for (const segment of item.segments) lines.push(`- ${segment.start?.toFixed?.(2) ?? ""}-${segment.end?.toFixed?.(2) ?? ""}: ${segment.text}`);
    } else if (item.text) {
      lines.push(item.text);
    } else {
      lines.push(isZh ? "无文本。" : "No text.");
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runDir = args.run ? path.resolve(args.run) : null;
  const requestedProvider = String(args.provider || "auto");
  const quality = String(args.quality || "balanced");
  const language = String(args.language || "auto").toLowerCase().startsWith("zh") ? "zh" : "en";
  const allowApi = args["allow-api"] === true;
  if (!runDir) {
    console.error("Usage: node scripts/transcribe-audio.mjs --run <run-dir> [--provider auto|whisper.cpp|faster-whisper|openai-whisper|qwen3-asr|none] [--model auto] [--quality low|balanced|quality|best]");
    process.exit(2);
  }
  await mkdir(path.join(runDir, "metadata"), { recursive: true });
  await mkdir(path.join(runDir, "output"), { recursive: true });

  const wavs = await listWavs(runDir);
  const hardware = detectHardware();
  const providers = detectProviders(hardware);
  let choice = chooseProvider(requestedProvider, providers, hardware);
  if (requestedProvider === "none") choice = { selected: null, reason: "user_disabled_asr" };
  const model = args.model && args.model !== "auto" ? String(args.model) : defaultModel(choice.selected, quality, hardware);
  const payload = {
    schema_version: "ffmpeg_video_recreator.speech_transcript.v1",
    created_at: new Date().toISOString(),
    localOnly: true,
    apiUsed: allowApi,
    providerSelection: {
      requested: requestedProvider,
      selected: choice.selected,
      reason: wavs.length ? choice.reason : "no_extracted_audio_wav_found",
      fallbackEnabled: args.fallback !== false,
      detectedProviders: providers
    },
    hardware,
    model: {
      name: model,
      quality
    },
    status: "skipped",
    transcripts: []
  };
  if (allowApi) {
    payload.status = "skipped";
    payload.providerSelection.reason = "api_providers_are_disabled_by_project_policy";
  } else if (!wavs.length || !choice.selected) {
    payload.status = "skipped";
  } else if (choice.selected === "whisper.cpp") {
    if (!whisperCppModelUsable(model)) {
      payload.status = "skipped";
      payload.providerSelection.reason = "whisper_cpp_requires_local_model_path_set_with_model_or_WHISPER_CPP_MODEL";
    } else {
      payload.transcripts = await transcribeWhisperCpp(providers.whisper_cpp, wavs, runDir, path.resolve(model));
      payload.status = payload.transcripts.some((item) => item.status === "completed") ? "completed" : "failed";
    }
  } else if (choice.selected === "faster-whisper") {
    payload.transcripts = await transcribeFasterWhisper(wavs, runDir, model);
    payload.status = payload.transcripts.some((item) => item.status === "completed") ? "completed" : "failed";
  } else if (choice.selected === "openai-whisper") {
    payload.transcripts = await transcribeOpenAIWhisper(wavs, runDir, model);
    payload.status = payload.transcripts.some((item) => item.status === "completed") ? "completed" : "failed";
  } else if (choice.selected === "qwen3-asr") {
    payload.transcripts = await transcribeQwen3Asr(wavs, runDir, model);
    payload.status = payload.transcripts.some((item) => item.status === "completed") ? "completed" : "failed";
  }

  await writeFile(path.join(runDir, "metadata", "speech-transcript.json"), `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(path.join(runDir, "output", "speech-transcript.md"), transcriptMarkdown(payload, language), "utf8");
  console.log(JSON.stringify({
    status: payload.status,
    provider: payload.providerSelection.selected,
    model: payload.model.name,
    outputs: ["metadata/speech-transcript.json", "output/speech-transcript.md"]
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
