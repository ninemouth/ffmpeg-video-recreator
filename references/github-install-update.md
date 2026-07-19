# GitHub Install and Update Contract

Use this when a user asks Codex to install, update, reinstall, or deploy `$ffmpeg-video-recreator` from GitHub.

## Repository

Default public repository:

```text
https://github.com/ninemouth/ffmpeg-video-recreator.git
```

Default branch:

```text
main
```

Companion image-asset skill installed by default:

```text
https://github.com/ninemouth/video-frame-image-asset-generator.git
```

## macOS or Windows Prompt Flow

Users should not need CLI flags. For normal install or update, have the user say one natural-language request, then Codex runs the bundled installer:

```text
安装或更新 $ffmpeg-video-recreator，并配置图片生成能力。
```

```text
Install or update $ffmpeg-video-recreator and configure image generation.
```

When the skill is not installed, Codex can run this internal equivalent:

```bash
git clone https://github.com/ninemouth/ffmpeg-video-recreator.git
cd ffmpeg-video-recreator
node scripts/install-or-update-from-github.mjs
```

The installer also clones/verifies/syncs `$video-frame-image-asset-generator` into:

```text
${CODEX_HOME}/skills/video-frame-image-asset-generator
```

During install or update, provider configuration is prompted when interactive. Ask the user for the base URL and API key in plain language only if the installer prompt cannot be displayed. Do not ask normal users to pass CLI flags.

Automation-only non-interactive environments may provide values explicitly:

```bash
node scripts/install-or-update-from-github.mjs \
  --image-provider-base-url "https://www.thinkai.tv/v1" \
  --image-provider-api-key "<API_KEY>"
```

Use `--skip-image-provider-config` or `--no-companion-image-skill` only for internal automation or development; do not present these flags as the default user path.

When the skill is already cloned locally and the user asks to update:

```bash
cd ffmpeg-video-recreator
node scripts/install-or-update-from-github.mjs --update
```

When Codex only has an installed skill copy under `~/.codex/skills`, use:

```bash
node scripts/check-skill-update.mjs
```

If `needs_update` is true, clone or pull the GitHub repository and rerun `install-or-update-from-github.mjs --update`.

## Behavior Requirements

- Verify the development copy before syncing.
- Back up the existing installed skill before replacing it.
- Sync into `${CODEX_HOME}/skills/ffmpeg-video-recreator` when `CODEX_HOME` is set; otherwise use `~/.codex/skills/ffmpeg-video-recreator`.
- Install or update the companion `$video-frame-image-asset-generator` skill unless `--no-companion-image-skill` is passed.
- Prompt for third-party image provider base URL and API key during install/update when values are not supplied and the terminal is interactive. Store local provider config under `${CODEX_HOME}/video-frame-image-asset-generator/image-provider.json` with restricted permissions; never commit or print the full key.
- Keep the user-facing path natural-language-first. CLI flags are allowed for internal automation only.
- Write release metadata to `.ffmpeg-video-recreator-release.json`.
- Never silently overwrite a user-modified development checkout. If `git status --short` is dirty during update, stop unless `--allow-dirty` is passed.
- Work on macOS and Windows with Node.js 18+ and Git available.

## User-Facing Completion Proof

Report:

- Source checkout path.
- Installed skill path.
- Local commit and branch.
- Whether a backup was created.
- Verification result.
- Companion image skill source checkout and installed path.
