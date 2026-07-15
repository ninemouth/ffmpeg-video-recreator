#!/usr/bin/env node
// Copyright (c) 2026 Yang Cao <cao.x.yang@gmail.com>
// SPDX-License-Identifier: MIT

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "..");
const defaultVenv = path.join(skillRoot, ".venv-audio");

const profiles = {
  signal: ["numpy", "scipy", "soundfile", "librosa"],
  "asr-faster-whisper": ["faster-whisper"],
  "asr-openai-whisper": ["openai-whisper"],
  events: ["tensorflow", "tensorflow-hub"]
};

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

function basePython() {
  return ["python3", "python"].find(commandExists) || null;
}

function venvPython(venvDir) {
  return process.platform === "win32"
    ? path.join(venvDir, "Scripts", "python.exe")
    : path.join(venvDir, "bin", "python");
}

function run(command, args, options = {}) {
  console.log(`$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd || skillRoot,
    stdio: options.stdio || "inherit",
    encoding: "utf8",
    maxBuffer: 100 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
  }
  return result;
}

function selectedProfiles(value) {
  const raw = String(value || "signal")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (raw.includes("all")) return Object.keys(profiles);
  for (const item of raw) {
    if (!profiles[item]) throw new Error(`Unsupported audio support profile: ${item}`);
  }
  return raw;
}

function packageList(profileNames) {
  return [...new Set(profileNames.flatMap((profile) => profiles[profile]))];
}

function moduleChecks(profileNames) {
  const checks = new Set();
  for (const profile of profileNames) {
    if (profile === "signal") checks.add("librosa");
    if (profile === "asr-faster-whisper") checks.add("faster_whisper");
    if (profile === "asr-openai-whisper") checks.add("whisper");
    if (profile === "events") {
      checks.add("tensorflow");
      checks.add("tensorflow_hub");
    }
  }
  return [...checks];
}

function checkModules(python, modules) {
  const status = {};
  for (const moduleName of modules) {
    const result = spawnSync(python, ["-c", `import ${moduleName}`], { encoding: "utf8" });
    status[moduleName] = result.status === 0;
  }
  return status;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const venvDir = path.resolve(args.venv || defaultVenv);
  const profileNames = selectedProfiles(args.profile || args.profiles || "signal");
  const packages = packageList(profileNames);
  const python = venvPython(venvDir);

  if (!existsSync(python)) {
    const systemPython = basePython();
    if (!systemPython) throw new Error("python3/python is required to create the audio support venv.");
    run(systemPython, ["-m", "venv", venvDir]);
  }

  run(python, ["-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"]);
  if (packages.length) run(python, ["-m", "pip", "install", ...packages]);

  await mkdir(path.join(skillRoot, ".cache"), { recursive: true });
  const support = {
    schema_version: "ffmpeg_video_recreator.audio_support.v1",
    created_at: new Date().toISOString(),
    skill_root: skillRoot,
    venv: venvDir,
    python,
    profiles: profileNames,
    packages,
    modules: checkModules(python, moduleChecks(profileNames)),
    usage: {
      env: `FFMPEG_SKILL_AUDIO_PYTHON=${python}`,
      note: "Audio scripts auto-detect .venv-audio, so this environment variable is optional unless using a custom venv."
    }
  };
  await writeFile(path.join(skillRoot, ".cache", "audio-support.json"), `${JSON.stringify(support, null, 2)}\n`);
  console.log(JSON.stringify({ status: "installed", ...support }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
