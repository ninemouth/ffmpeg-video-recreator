#!/usr/bin/env node
// Copyright (c) 2026 Yang Cao <cao.x.yang@gmail.com>
// SPDX-License-Identifier: MIT

import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

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

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd || process.cwd(),
    stdio: options.stdio || "pipe",
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(" ")} failed with exit ${result.status}`);
  }
  return result.stdout;
}

function gitValue(cwd, gitArgs) {
  const result = spawnSync("git", gitArgs, { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

function detectRemoteBranch(cwd) {
  const upstream = gitValue(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (upstream) return upstream.replace(/^[^/]+\//, "");
  const branch = gitValue(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  return branch && branch !== "HEAD" ? branch : "";
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

async function readPackageVersion(root) {
  try {
    const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    return pkg.version || "";
  } catch {
    return "";
  }
}

async function compareTrees(left, right, excludedNames, relative = "") {
  const differences = [];
  const leftEntries = await readDirMap(left, excludedNames);
  const rightEntries = await readDirMap(right, excludedNames);
  const names = new Set([...leftEntries.keys(), ...rightEntries.keys()]);
  for (const name of [...names].sort()) {
    const rel = path.join(relative, name);
    const leftEntry = leftEntries.get(name);
    const rightEntry = rightEntries.get(name);
    if (!leftEntry) {
      differences.push(`Only in installed: ${rel}`);
      continue;
    }
    if (!rightEntry) {
      differences.push(`Only in source: ${rel}`);
      continue;
    }
    const leftPath = path.join(left, name);
    const rightPath = path.join(right, name);
    if (leftEntry.isDirectory() !== rightEntry.isDirectory()) {
      differences.push(`Type differs: ${rel}`);
      continue;
    }
    if (leftEntry.isDirectory()) {
      differences.push(...await compareTrees(leftPath, rightPath, excludedNames, rel));
    } else if (!await sameFile(leftPath, rightPath)) {
      differences.push(`File differs: ${rel}`);
    }
  }
  return differences;
}

async function readDirMap(dir, excludedNames) {
  const entries = new Map();
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!excludedNames.has(entry.name)) entries.set(entry.name, entry);
  }
  return entries;
}

async function sameFile(left, right) {
  const [leftStat, rightStat] = await Promise.all([stat(left), stat(right)]);
  if (leftStat.size !== rightStat.size) return false;
  const [leftBytes, rightBytes] = await Promise.all([readFile(left), readFile(right)]);
  return leftBytes.equals(rightBytes);
}

const args = parseArgs(process.argv.slice(2));
const skillName = args["skill-name"] || "ffmpeg-video-recreator";
const source = path.resolve(args.source || ".");
const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
const target = path.resolve(args.dest || path.join(codexHome, "skills", skillName));
const backupRoot = path.resolve(args["backup-root"] || path.join(codexHome, "skill-backups"));
const excludes = new Set([".git", "node_modules", "work", "runs", ".cache", ".venv-audio", ".models", ".DS_Store", ".ffmpeg-video-recreator-release.json"]);

if (!existsSync(path.join(source, "SKILL.md"))) {
  throw new Error(`Source does not look like a Codex skill: ${source}`);
}

if (!args["skip-verify"]) {
  run(process.execPath, [path.join(source, "scripts", "verify-skill.mjs")], { cwd: source, stdio: "inherit" });
}

let backup = null;
if (existsSync(target) && !args["no-backup"]) {
  backup = path.join(backupRoot, `${skillName}-${timestamp()}`);
  await mkdir(path.dirname(backup), { recursive: true });
  await cp(target, backup, { recursive: true });
}

await mkdir(path.dirname(target), { recursive: true });
await rm(target, { recursive: true, force: true });
await cp(source, target, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(source, src);
    if (!rel) return true;
    const first = rel.split(path.sep)[0];
    return !excludes.has(first);
  }
});

const differences = await compareTrees(source, target, excludes);
if (differences.length) {
  throw new Error(`Installed skill differs from source:\n${differences.slice(0, 40).join("\n")}`);
}

const release = {
  schema_version: "ffmpeg_video_recreator.skill_release.v1",
  skill_name: skillName,
  package_version: await readPackageVersion(source),
  source_path: source,
  dest_path: target,
  backup_path: backup,
  local_commit: gitValue(source, ["rev-parse", "HEAD"]),
  local_branch: gitValue(source, ["rev-parse", "--abbrev-ref", "HEAD"]),
  remote_url: gitValue(source, ["config", "--get", "remote.origin.url"]) || "https://github.com/ninemouth/ffmpeg-video-recreator.git",
  remote_branch: args["remote-branch"] || detectRemoteBranch(source) || "main",
  synced_at: new Date().toISOString()
};

await writeFile(path.join(target, ".ffmpeg-video-recreator-release.json"), `${JSON.stringify(release, null, 2)}\n`);

console.log(JSON.stringify({ status: "synced", source, target, backup, release }, null, 2));
