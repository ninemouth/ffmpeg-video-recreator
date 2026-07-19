#!/usr/bin/env node
// Copyright (c) 2026 Yang Cao <cao.x.yang@gmail.com>
// SPDX-License-Identifier: MIT

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

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

const requiredSections = [
  ["source_inventory", ["## 1. Source Inventory", "## 1. 源视频清单"]],
  ["keyframe_deliverables", ["## 2. Keyframe Deliverables", "## 2. 关键帧交付物", "## 2. 关键帧证据"]],
  ["recreation_pack", ["## 3. Recreation Pack", "## 3. 复刻交接包"]],
  ["segment_continuity", ["## 4. Segment Continuity Plan", "## 4. 分段连续性方案"]],
  ["executive_summary", ["## 5. Executive Summary", "## 5. 视频整体总结"]],
  ["timeline_reconstruction", ["## 6. Timeline Reconstruction", "## 6. 时间线与镜头拆解"]],
  ["visual_dna", ["## 7. Visual DNA", "## 7. 视觉 DNA"]],
  ["script_reconstruction", ["## 8. Script Reconstruction", "## 8. 剧本与分镜脚本复原"]],
  ["ai_recreation_prompt_pack", ["## 9. AI Recreation Prompt Pack", "## 9. AI 视频复刻提示词包"]],
  ["modification_plan", ["## 10. Modification Plan", "## 10. 修改计划"]],
  ["gaps_and_qa", ["## 11. Gaps and QA", "## 11. 缺口与 QA"]]
];

const requiredPackEntries = [
  "output/recreation-pack/README.md",
  "output/recreation-pack/recreation-brief.md",
  "output/recreation-pack/shot-list.md",
  "output/recreation-pack/segment-plan.md",
  "output/recreation-pack/prompts.md",
  "output/recreation-pack/continuity-locks.md",
  "output/recreation-pack/modification-plan.md",
  "output/recreation-pack/reference-keyframes",
  "output/recreation-pack/segments",
  "output/recreation-pack/recreation-manifest.json"
];

const requiredSupportMentions = [
  "metadata/manifest.json",
  "metadata/frame-index.json",
  "metadata/frame-quality.json",
  "output/keyframes-index.md",
  "output/keyframes/",
  "output/recreation-pack/",
  "output/recreation-pack/segment-plan.md",
  "output/recreation-pack/continuity-locks.md",
  "output/delivery-manifest.json",
  "output/report-contract-check.json"
];

async function existsAt(runDir, relativePath) {
  try {
    const entry = await stat(path.join(runDir, relativePath));
    return { exists: true, type: entry.isDirectory() ? "directory" : "file" };
  } catch {
    return { exists: false, type: null };
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function hasAny(text, candidates) {
  return candidates.some((candidate) => text.includes(candidate));
}

function sectionStatus(report) {
  return requiredSections.map(([id, headings]) => ({
    id,
    passed: hasAny(report, headings),
    accepted_headings: headings
  }));
}

function directAccessStatus(manifest) {
  const expectedPrefix = [
    "complete_delivery_package",
    "delivery_index",
    "recreate_report",
    "ai_recreation_pack",
    "segment_plan",
    "continuity_locks",
    "keyframes",
    "keyframes_index",
    "delivery_manifest"
  ];
  const ids = Array.isArray(manifest.direct_access) ? manifest.direct_access.map((item) => item.id) : [];
  const prefixOk = expectedPrefix.every((id, index) => ids[index] === id);
  return {
    passed: Boolean(Array.isArray(manifest.direct_access) && manifest.direct_access.length >= expectedPrefix.length && prefixOk),
    expected_prefix: expectedPrefix,
    actual: ids
  };
}

function reportMentionStatus(report, manifest) {
  const mentions = requiredSupportMentions.map((needle) => ({
    path: needle,
    passed: report.includes(needle)
  }));
  const directAccessIds = Array.isArray(manifest.direct_access) ? manifest.direct_access.map((item) => item.id) : [];
  const needsAudio = ["audio_analysis", "speech_transcript", "audio_events"].some((id) => directAccessIds.includes(id));
  if (needsAudio) {
    for (const needle of ["metadata/audio-streams.json", "metadata/audio-analysis.json", "metadata/speech-transcript.json", "metadata/audio-events.json", "output/audio-analysis.md", "output/speech-transcript.md", "output/audio-events.md"]) {
      mentions.push({ path: needle, passed: report.includes(needle) });
    }
  }
  return mentions;
}

async function fileStatus(runDir, manifest) {
  const baseFiles = [
    "output/README.md",
    "output/recreate-report.md",
    "output/keyframes-index.md",
    "output/delivery-manifest.json",
    "metadata/manifest.json",
    "metadata/frame-index.json",
    ...requiredPackEntries
  ];
  const directAccessIds = Array.isArray(manifest.direct_access) ? manifest.direct_access.map((item) => item.id) : [];
  if (directAccessIds.includes("audio_analysis")) baseFiles.push("output/audio-analysis.md", "metadata/audio-analysis.json", "metadata/audio-streams.json");
  if (directAccessIds.includes("speech_transcript")) baseFiles.push("output/speech-transcript.md", "metadata/speech-transcript.json");
  if (directAccessIds.includes("audio_events")) baseFiles.push("output/audio-events.md", "metadata/audio-events.json");
  const uniqueFiles = [...new Set(baseFiles)];
  const results = [];
  for (const relativePath of uniqueFiles) {
    results.push({ path: relativePath, ...(await existsAt(runDir, relativePath)) });
  }
  return results;
}

function countMeaningfulRows(report) {
  return report
    .split(/\r?\n/)
    .filter((line) => /^\|/.test(line.trim()) && !/^\|\s*-+/.test(line.trim()))
    .length;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runDir = args.run ? path.resolve(args.run) : null;
  if (!runDir) {
    console.error("Usage: node scripts/validate-report-contract.mjs --run <run-dir>");
    process.exit(2);
  }

  const reportPath = path.join(runDir, "output", "recreate-report.md");
  const manifestPath = path.join(runDir, "output", "delivery-manifest.json");
  const frameIndexPath = path.join(runDir, "metadata", "frame-index.json");
  const report = await readFile(reportPath, "utf8");
  const manifest = await readJson(manifestPath);
  const frameIndex = await readJson(frameIndexPath);

  const sections = sectionStatus(report);
  const files = await fileStatus(runDir, manifest);
  const directAccess = directAccessStatus(manifest);
  const mentions = reportMentionStatus(report, manifest);
  const todoCount = (report.match(/\bTODO\b|TODO：/g) || []).length;
  const keyframeReferences = (report.match(/frame-[0-9]+\.jpg/g) || []).length + (report.match(/output\/keyframes\//g) || []).length;
  const expectedFrameReferences = Math.min(Array.isArray(frameIndex) ? frameIndex.length : 0, 3);
  const tables = countMeaningfulRows(report);

  const checks = [
    ...sections.map((item) => ({ id: `section:${item.id}`, passed: item.passed })),
    ...files.map((item) => ({ id: `file:${item.path}`, passed: item.exists })),
    ...mentions.map((item) => ({ id: `mention:${item.path}`, passed: item.passed })),
    { id: "direct_access:stable_order", passed: directAccess.passed },
    { id: "report:no_todo_placeholders", passed: todoCount === 0 },
    { id: "report:keyframe_evidence_references", passed: keyframeReferences >= expectedFrameReferences },
    { id: "report:tables_present", passed: tables >= 3 }
  ];
  const failures = checks.filter((check) => !check.passed);
  const payload = {
    schema_version: "ffmpeg_video_recreator.report_contract_check.v1",
    created_at: new Date().toISOString(),
    run_directory: runDir,
    status: failures.length ? "failed" : "passed",
    summary: {
      checks: checks.length,
      failures: failures.length,
      todo_count: todoCount,
      keyframe_references: keyframeReferences,
      expected_frame_references: expectedFrameReferences,
      table_rows: tables
    },
    sections,
    files,
    mentions,
    direct_access: directAccess,
    failures
  };

  await mkdir(path.join(runDir, "output"), { recursive: true });
  await writeFile(path.join(runDir, "output", "report-contract-check.json"), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({
    status: payload.status,
    failures: failures.length,
    report_contract_check: "output/report-contract-check.json"
  }, null, 2));
  if (failures.length) process.exit(1);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
