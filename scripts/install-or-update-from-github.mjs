#!/usr/bin/env node
// Copyright (c) 2026 Yang Cao <cao.x.yang@gmail.com>
// SPDX-License-Identifier: MIT

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
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
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    stdio: options.stdio || "inherit",
    encoding: "utf8",
    shell: process.platform === "win32" && options.shell !== false,
    maxBuffer: 50 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
  }
  return result.stdout || "";
}

function commandExists(command) {
  const probe = process.platform === "win32" ? "where" : "command";
  const probeArgs = process.platform === "win32" ? [command] : ["-v", command];
  const result = spawnSync(probe, probeArgs, { encoding: "utf8", shell: process.platform !== "win32" });
  return result.status === 0;
}

function gitValue(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

const args = parseArgs(process.argv.slice(2));
const repo = args.repo || "https://github.com/ninemouth/ffmpeg-video-recreator.git";
const branch = args.branch || "main";
const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
const checkoutRoot = path.resolve(args["checkout-root"] || path.join(codexHome, "skill-sources"));
const checkoutDir = path.resolve(args.checkout || path.join(checkoutRoot, "ffmpeg-video-recreator"));
const update = Boolean(args.update);

if (!commandExists("git")) throw new Error("Git is required before installing this skill from GitHub.");
if (!commandExists("node")) throw new Error("Node.js 18+ is required before installing this skill.");

await mkdir(checkoutRoot, { recursive: true });

if (!existsSync(path.join(checkoutDir, ".git"))) {
  run("git", ["clone", "--branch", branch, repo, checkoutDir]);
} else {
  const dirty = gitValue(checkoutDir, ["status", "--short"]);
  if (dirty && !args["allow-dirty"]) {
    throw new Error(`Checkout is dirty at ${checkoutDir}. Commit/stash changes or pass --allow-dirty.`);
  }
  if (update) {
    run("git", ["fetch", "origin", branch], { cwd: checkoutDir });
    run("git", ["checkout", branch], { cwd: checkoutDir });
    run("git", ["pull", "--ff-only", "origin", branch], { cwd: checkoutDir });
  }
}

run(process.execPath, ["scripts/verify-skill.mjs"], { cwd: checkoutDir });
run(process.execPath, ["scripts/sync-to-codex-skill.mjs", "--remote-branch", branch], { cwd: checkoutDir });

console.log(JSON.stringify({
  status: "installed",
  source_checkout: checkoutDir,
  installed_skill: path.join(codexHome, "skills", "ffmpeg-video-recreator"),
  branch,
  commit: gitValue(checkoutDir, ["rev-parse", "HEAD"])
}, null, 2));
