#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";

function parseArgs(argv) {
  return new Set(argv);
}

function commandExists(command) {
  const probe = process.platform === "win32" ? "where" : "command";
  const args = process.platform === "win32" ? [command] : ["-v", command];
  const result = spawnSync(probe, args, { encoding: "utf8", shell: process.platform !== "win32" });
  return result.status === 0;
}

function run(command, args) {
  console.log(`$ ${command} ${args.join(" ")}`);
  return spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
}

const flags = parseArgs(process.argv.slice(2));
const hasFfmpeg = commandExists("ffmpeg");
const hasFfprobe = commandExists("ffprobe");

if (flags.has("--check") || (!flags.has("--install") && !flags.has("--check"))) {
  console.log(JSON.stringify({ ffmpeg: hasFfmpeg, ffprobe: hasFfprobe, platform: process.platform }, null, 2));
  process.exit(hasFfmpeg && hasFfprobe ? 0 : 1);
}

if (!flags.has("--install")) {
  console.error("Use --check or --install.");
  process.exit(2);
}

if (hasFfmpeg && hasFfprobe) {
  console.log("FFmpeg and ffprobe are already available.");
  process.exit(0);
}

let result;
if (process.platform === "darwin") {
  if (!commandExists("brew")) {
    console.error("Homebrew is not installed. Install Homebrew, then rerun: node scripts/install-ffmpeg.mjs --install");
    process.exit(3);
  }
  result = run("brew", ["install", "ffmpeg"]);
} else if (process.platform === "win32") {
  if (commandExists("winget")) {
    result = run("winget", ["install", "--id", "Gyan.FFmpeg", "-e", "--source", "winget"]);
  } else if (commandExists("choco")) {
    result = run("choco", ["install", "ffmpeg", "-y"]);
  } else if (commandExists("scoop")) {
    result = run("scoop", ["install", "ffmpeg"]);
  } else {
    console.error("No supported Windows package manager found. Install winget, Chocolatey, or Scoop, then rerun.");
    process.exit(4);
  }
} else {
  console.error(`Unsupported automatic install platform: ${process.platform}. Install ffmpeg manually, then rerun --check.`);
  process.exit(5);
}

process.exit(result.status || 0);
