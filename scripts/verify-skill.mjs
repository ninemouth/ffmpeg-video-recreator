#!/usr/bin/env node
// Copyright (c) 2026 Yang Cao <cao.x.yang@gmail.com>
// SPDX-License-Identifier: MIT

import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const copyrightNotice = "Copyright (c) 2026 Yang Cao <cao.x.yang@gmail.com>";
const spdxNotice = "SPDX-License-Identifier: MIT";
const required = [
  "SKILL.md",
  "agents/openai.yaml",
  "package.json",
  "README.md",
  "LICENSE",
  "scripts/create-run-skeleton.mjs",
  "scripts/install-ffmpeg.mjs",
  "scripts/extract-keyframes.mjs",
  "scripts/install-audio-support.mjs",
  "scripts/self-check-audio-support.mjs",
  "scripts/analyze-audio.mjs",
  "scripts/transcribe-audio.mjs",
  "scripts/classify-audio-events.mjs",
  "scripts/validate-report-contract.mjs",
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
if (!skill.includes("direct_access") || !skill.includes("output/README.md")) {
  throw new Error("SKILL.md must require the stable direct-access delivery index.");
}

const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
for (const script of ["verify", "ffmpeg:check", "ffmpeg:install", "extract:keyframes", "audio:install", "audio:analyze", "audio:transcribe", "audio:events", "audio:self-check", "report:validate", "check:update", "install:github", "update:github", "sync:codex"]) {
  if (!pkg.scripts?.[script]) throw new Error(`package.json missing script: ${script}`);
}
if (pkg.license !== "MIT") {
  throw new Error("package.json license must be MIT.");
}
if (pkg.author?.name !== "Yang Cao" || pkg.author?.email !== "cao.x.yang@gmail.com") {
  throw new Error("package.json author must be Yang Cao <cao.x.yang@gmail.com>.");
}
if (pkg.repository?.url !== "https://github.com/ninemouth/ffmpeg-video-recreator.git") {
  throw new Error("package.json repository URL must point to the public GitHub repo.");
}

const licenseText = await readFile(path.join(root, "LICENSE"), "utf8");
for (const expected of [
  "MIT License",
  "MIT 许可证（中文参考译文）",
  copyrightNotice,
  "上方英文 MIT License 为正式许可文本"
]) {
  if (!licenseText.includes(expected)) {
    throw new Error(`LICENSE is missing required text: ${expected}`);
  }
}

for (const file of required.filter((entry) => entry.startsWith("scripts/"))) {
  const source = await readFile(path.join(root, file), "utf8");
  if (!source.includes(copyrightNotice) || !source.includes(spdxNotice)) {
    throw new Error(`${file} is missing the required source license header.`);
  }
}

const extractSource = await readFile(path.join(root, "scripts/extract-keyframes.mjs"), "utf8");
for (const expected of [
  "createDirectAccessItems",
  "createDeliveryIndex",
  "direct_access",
  "output/README.md",
  "Final user replies must expose this direct_access list"
]) {
  if (!extractSource.includes(expected)) {
    throw new Error(`extract-keyframes.mjs is missing direct-access contract text: ${expected}`);
  }
}

const reportValidatorSource = await readFile(path.join(root, "scripts/validate-report-contract.mjs"), "utf8");
for (const expected of [
  "ffmpeg_video_recreator.report_contract_check.v1",
  "requiredSections",
  "direct_access",
  "report-contract-check.json",
  "no_todo_placeholders"
]) {
  if (!reportValidatorSource.includes(expected)) {
    throw new Error(`validate-report-contract.mjs is missing required contract check text: ${expected}`);
  }
}

console.log("All verification checks passed.");
