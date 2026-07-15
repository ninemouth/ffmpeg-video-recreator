#!/usr/bin/env node
// Copyright (c) 2026 Yang Cao <cao.x.yang@gmail.com>
// SPDX-License-Identifier: MIT

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

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

function slugify(value) {
  return String(value || "video-recreation")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "video-recreation";
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

const args = parseArgs(process.argv.slice(2));
const input = args.input ? path.resolve(args.input) : "";
const runRoot = path.resolve(args.root || "work/runs");
const runId = `${timestamp()}-${slugify(args.slug || path.basename(input) || "video-recreation")}`;
const runDir = path.join(runRoot, runId);

for (const dir of ["input", "frames", "audio", "metadata", "output", "qa"]) {
  await mkdir(path.join(runDir, dir), { recursive: true });
}

const manifest = {
  run_id: runId,
  created_at: new Date().toISOString(),
  input_directory: input,
  run_directory: runDir,
  status: "initialized"
};

await writeFile(path.join(runDir, "metadata", "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(path.join(runDir, "output", "recreate-report.md"), "# Recreate Report\n\nFill this report using references/report-contract.md after keyframe extraction and visual inspection.\n");

console.log(runDir);
