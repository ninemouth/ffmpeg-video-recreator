#!/usr/bin/env node
// Copyright (c) 2026 Yang Cao <cao.x.yang@gmail.com>
// SPDX-License-Identifier: MIT

import { mkdir, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "..");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || skillRoot,
    encoding: "utf8",
    maxBuffer: 200 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stderr || result.stdout}`);
  }
  return result;
}

function commandExists(command) {
  const probe = process.platform === "win32" ? "where" : "command";
  const args = process.platform === "win32" ? [command] : ["-v", command];
  return spawnSync(probe, args, { encoding: "utf8", shell: process.platform !== "win32" }).status === 0;
}

async function main() {
  if (!commandExists("ffmpeg") || !commandExists("ffprobe")) {
    throw new Error("ffmpeg and ffprobe are required for audio self-check.");
  }
  const root = path.join(os.tmpdir(), `ffmpeg-skill-audio-self-check-${Date.now()}`);
  const input = path.join(root, "input");
  const runDir = path.join(root, "run");
  await mkdir(input, { recursive: true });
  await mkdir(runDir, { recursive: true });
  const sample = path.join(input, "sample.mp4");
  try {
    run("ffmpeg", [
      "-hide_banner", "-y",
      "-f", "lavfi", "-i", "color=c=black:size=320x180:rate=10",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=16000:duration=1.2",
      "-t", "1.2",
      "-c:v", "libx264",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      sample
    ]);
    run(process.execPath, [
      path.join(scriptDir, "extract-keyframes.mjs"),
      "--input", input,
      "--run", runDir,
      "--mode", "interval",
      "--interval", "1",
      "--language", "en"
    ]);
    const audio = JSON.parse(await readFile(path.join(runDir, "metadata", "audio-analysis.json"), "utf8"));
    const speech = JSON.parse(await readFile(path.join(runDir, "metadata", "speech-transcript.json"), "utf8"));
    const events = JSON.parse(await readFile(path.join(runDir, "metadata", "audio-events.json"), "utf8"));
    const result = {
      status: "completed",
      audio_signal: audio.files?.[0]?.signal?.librosa?.status || "unknown",
      speech_asr: {
        status: speech.status,
        provider: speech.providerSelection?.selected,
        reason: speech.providerSelection?.reason
      },
      audio_events: {
        status: events.status,
        provider: events.providerSelection?.selected,
        reason: events.providerSelection?.reason,
        event_items: events.events?.length || 0
      }
    };
    if (result.audio_signal !== "completed") throw new Error(`librosa self-check failed: ${result.audio_signal}`);
    if (result.speech_asr.status !== "completed") throw new Error(`ASR self-check failed: ${JSON.stringify(result.speech_asr)}`);
    if (result.audio_events.status !== "completed") throw new Error(`audio events self-check failed: ${JSON.stringify(result.audio_events)}`);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (process.env.FFMPEG_SKILL_KEEP_SELF_CHECK !== "true") {
      await rm(root, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
