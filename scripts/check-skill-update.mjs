#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

function gitValue(cwd, gitArgs, timeout = 2000) {
  if (!existsSync(path.join(cwd, ".git"))) return "";
  const result = spawnSync("git", gitArgs, { cwd, encoding: "utf8", timeout });
  return result.status === 0 ? result.stdout.trim() : "";
}

function normalizeGitUrl(value) {
  return String(value || "").replace(/^git\+/, "");
}

function normalizeCommit(value) {
  const text = String(value || "").trim();
  return /^[0-9a-f]{7,40}$/i.test(text) ? text : "";
}

function remoteRevision(remote, branch, timeoutMs) {
  const result = spawnSync("git", ["ls-remote", remote, `refs/heads/${branch}`], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024
  });
  if (result.error) return { status: "unknown", commit: "", error: result.error.message };
  if (result.status !== 0) return { status: "unknown", commit: "", error: (result.stderr || result.stdout || "").trim() };
  const commit = normalizeCommit(result.stdout.split(/\s+/)[0]);
  return commit ? { status: "ok", commit } : { status: "unknown", commit: "", error: "No remote head returned." };
}

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args["skill-root"] || path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const release = await readJson(path.join(root, ".ffmpeg-video-recreator-release.json")) || {};
const pkg = await readJson(path.join(root, "package.json")) || {};
const remote = args.remote || release.remote_url || normalizeGitUrl(pkg.repository?.url) || "https://github.com/ninemouth/ffmpeg-video-recreator.git";
const branch = args.branch || release.remote_branch || "main";
const cacheFile = path.resolve(args["cache-file"] || path.join(root, ".cache", "skill-update-status.json"));
const timeoutMs = Math.max(500, Number(args["timeout-ms"] || 2500));
const localCommit = normalizeCommit(release.local_commit || release.git_commit || gitValue(root, ["rev-parse", "HEAD"]));
const remoteResult = args["skip-remote"]
  ? { status: "skipped", commit: "" }
  : remoteRevision(remote, branch, timeoutMs);

let status = "unknown";
if (localCommit && remoteResult.status === "ok" && remoteResult.commit) {
  status = localCommit === remoteResult.commit ? "current" : "update_available";
} else if (!localCommit) {
  status = "unknown_local_revision";
} else {
  status = "unknown_remote_revision";
}

const report = {
  schema_version: "ffmpeg_video_recreator.skill_update_status.v1",
  status,
  needs_update: status === "update_available",
  checked_at: new Date().toISOString(),
  skill_root: root,
  local: {
    commit: localCommit,
    branch: release.local_branch || gitValue(root, ["rev-parse", "--abbrev-ref", "HEAD"]) || "",
    package_version: pkg.version || release.package_version || "",
    synced_at: release.synced_at || ""
  },
  remote: {
    url: remote,
    branch,
    commit: remoteResult.commit,
    status: remoteResult.status,
    error: remoteResult.error || null
  },
  install_hint: status === "update_available"
    ? "Run: node scripts/install-or-update-from-github.mjs --update from a cloned development copy, or ask Codex to update from https://github.com/ninemouth/ffmpeg-video-recreator."
    : ""
};

await mkdir(path.dirname(cacheFile), { recursive: true });
await writeFile(cacheFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (args["fail-on-update"] && report.needs_update) process.exitCode = 1;
