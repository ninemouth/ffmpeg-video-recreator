#!/usr/bin/env node
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
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

function gitCommit() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

const args = parseArgs(process.argv.slice(2));
const skillName = args["skill-name"] || "ffmpeg-video-recreator";
const source = path.resolve(args.source || ".");
const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
const target = path.join(codexHome, "skills", skillName);

await mkdir(path.dirname(target), { recursive: true });
await rm(target, { recursive: true, force: true });
await cp(source, target, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(source, src);
    if (!rel) return true;
    return !rel.startsWith(".git") && !rel.startsWith("node_modules") && !rel.startsWith("work") && !rel.startsWith("runs");
  }
});

await writeFile(path.join(target, ".ffmpeg-video-recreator-release.json"), `${JSON.stringify({
  skill_name: skillName,
  source,
  target,
  synced_at: new Date().toISOString(),
  git_commit: gitCommit()
}, null, 2)}\n`);

console.log(JSON.stringify({ synced: true, target }, null, 2));
