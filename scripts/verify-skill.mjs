#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const required = [
  "SKILL.md",
  "agents/openai.yaml",
  "package.json",
  "README.md",
  "LICENSE",
  "scripts/create-run-skeleton.mjs",
  "scripts/install-ffmpeg.mjs",
  "scripts/extract-keyframes.mjs",
  "scripts/check-skill-update.mjs",
  "scripts/install-or-update-from-github.mjs",
  "scripts/sync-to-codex-skill.mjs",
  "references/report-contract.md",
  "references/github-install-update.md",
  "references/ffmpeg-platform-notes.md"
];

for (const file of required) {
  await access(path.join(root, file));
}

const skill = await readFile(path.join(root, "SKILL.md"), "utf8");
if (!skill.startsWith("---\nname: ffmpeg-video-recreator\n")) {
  throw new Error("SKILL.md frontmatter name is invalid.");
}
if (skill.includes("TODO: Complete") || skill.includes("[TODO")) {
  throw new Error("SKILL.md still contains template TODO placeholders.");
}
if (!skill.includes("scripts/extract-keyframes.mjs") || !skill.includes("references/report-contract.md")) {
  throw new Error("SKILL.md does not route to required scripts and references.");
}

const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
for (const script of ["verify", "ffmpeg:check", "ffmpeg:install", "extract:keyframes", "check:update", "install:github", "update:github", "sync:codex"]) {
  if (!pkg.scripts?.[script]) throw new Error(`package.json missing script: ${script}`);
}
if (pkg.repository?.url !== "https://github.com/ninemouth/ffmpeg-video-recreator.git") {
  throw new Error("package.json repository URL must point to the public GitHub repo.");
}

console.log("All verification checks passed.");
