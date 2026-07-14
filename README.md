# FFmpeg Video Recreator

Codex skill for FFmpeg-based video keyframe extraction and recreate-ready video reports.

`ffmpeg-video-recreator` helps Codex analyze videos without asking the AI to read the raw video directly. The deterministic layer uses `ffmpeg` and `ffprobe` to inspect videos, extract keyframes, and create structured run artifacts. Codex then reviews the extracted frames and metadata to write a report, script, shot list, and prompt pack that another AI can use to recreate or modify the video.

中文说明见下方。English documentation follows after the Chinese section.

## 中文说明

### 这是什么

这是一个可在 Codex 中使用的 skill，用于：

- 在 macOS 或 Windows 下检查/安装 FFmpeg。
- 为每个视频分析任务创建独立工作目录和输出目录。
- 对指定目录下的视频批量读取 metadata。
- 使用 FFmpeg 抽取关键帧，而不是让 AI 直接读取原视频流。
- 基于关键帧和 metadata 生成可复刻创作报告，包括总结、镜头拆解、剧本、脚本、AI 视频生成提示词和修改方案。

核心目标是得到一份报告，让你可以把这份报告交给 AI 视频工具，用来复刻原视频，并对部分内容进行可控修改。

### 工作方式

```text
原视频目录
  ↓
ffprobe 读取视频 metadata
  ↓
ffmpeg 抽取关键帧 jpg
  ↓
Codex 查看关键帧 + metadata
  ↓
生成可复刻报告 / 剧本 / 镜头脚本 / AI 生成 prompt
```

AI 默认不直接读取原视频。AI 读取的是 FFmpeg 生成的关键帧、`manifest.json`、`frame-index.json` 和 `ffprobe` metadata。

### 在 Codex 中安装

直接对 Codex 说：

```text
从 https://github.com/ninemouth/ffmpeg-video-recreator 安装 $ffmpeg-video-recreator，并完成验证。
```

或者用英文：

```text
Install $ffmpeg-video-recreator from https://github.com/ninemouth/ffmpeg-video-recreator and verify it.
```

Codex 应该执行的等价命令：

```bash
git clone https://github.com/ninemouth/ffmpeg-video-recreator.git
cd ffmpeg-video-recreator
node scripts/install-or-update-from-github.mjs
```

安装后 skill 会被同步到：

```text
${CODEX_HOME}/skills/ffmpeg-video-recreator
```

如果没有设置 `CODEX_HOME`，默认是：

```text
~/.codex/skills/ffmpeg-video-recreator
```

### 在 Codex 中更新

直接对 Codex 说：

```text
更新 $ffmpeg-video-recreator 到 GitHub 最新版本，并验证安装后的 skill 是最新的。
```

或者用英文：

```text
Update $ffmpeg-video-recreator from GitHub and verify the installed skill is current.
```

等价命令：

```bash
cd ffmpeg-video-recreator
node scripts/install-or-update-from-github.mjs --update
```

检查已安装版本是否落后：

```bash
node ~/.codex/skills/ffmpeg-video-recreator/scripts/check-skill-update.mjs
```

### 在 Codex 中调用 skill 分析视频

安装后，你可以直接对 Codex 说：

```text
使用 $ffmpeg-video-recreator 分析 /path/to/video-folder 下的视频，抽取关键帧，并生成一份可以让 AI 复刻该视频的中文报告。报告需要包含视频总结、镜头拆解、剧本、分镜脚本、AI 生成提示词，以及我可以修改哪些内容。
```

更具体的示例：

```text
使用 $ffmpeg-video-recreator 分析 ~/Desktop/video-samples 下的所有视频。请创建独立任务目录，先确认或安装 ffmpeg，使用 hybrid 模式抽取关键帧，然后根据关键帧和 metadata 生成 output/recreate-report.md。报告用中文写，目标是让另一个 AI 视频工具可以复刻原视频，但把人物换成亚洲女性、背景换成办公室、保留原视频节奏和镜头语言。
```

英文示例：

```text
Use $ffmpeg-video-recreator to analyze all videos in ~/Desktop/video-samples. Create an isolated run directory, check or install ffmpeg, extract keyframes in hybrid mode, then write output/recreate-report.md from the frames and metadata. The report should help another AI recreate the video while changing the subject to an Asian woman in an office and preserving the original pacing and camera language.
```

### 手动使用

创建独立任务目录：

```bash
node scripts/create-run-skeleton.mjs --input "/path/to/video-folder" --slug "video-remake"
```

检查 FFmpeg：

```bash
node scripts/install-ffmpeg.mjs --check
```

如果缺少 FFmpeg，安装：

```bash
node scripts/install-ffmpeg.mjs --install
```

抽取关键帧：

```bash
node scripts/extract-keyframes.mjs \
  --input "/path/to/video-folder" \
  --run "work/runs/<run-id>" \
  --mode hybrid \
  --interval 2 \
  --scene-threshold 0.32
```

输出目录结构：

```text
work/runs/<run-id>/
├── input/
├── frames/
├── metadata/
│   ├── manifest.json
│   ├── frame-index.json
│   └── *.ffprobe.json
├── output/
│   └── recreate-report.md
└── qa/
```

### 抽帧模式

- `hybrid`：默认推荐。结合场景变化和固定间隔抽帧，适合大多数广告、短视频、产品视频。
- `scene`：基于画面变化抽帧，适合剪辑密集、镜头切换明显的视频。
- `interval`：按固定时间间隔抽帧，适合教程、录屏、讲解、长静态画面。

### 报告内容

最终报告应参考 [references/report-contract.md](references/report-contract.md)，至少包含：

- 源视频清单和技术 metadata。
- 视频整体总结。
- 时间线和镜头拆解。
- 画面风格、构图、光线、色彩、节奏、字幕和转场分析。
- 可复刻剧本和分镜脚本。
- AI 视频生成 master prompt 和逐镜头 prompt。
- 可修改项与必须保留项。
- 缺失信息和 QA 风险。

### 当前边界

- 当前版本会检测音频流，但不会自动转写音频。
- 旁白、对白、音乐和音效需要 Codex 根据可见字幕/画面进行标注，或后续接入 ASR/Whisper 类能力。
- 对快速运动或极快剪辑视频，可能需要调低 `--scene-threshold` 或缩短 `--interval`。

### 开发验证

```bash
npm run verify
```

同步到本机 Codex skills：

```bash
npm run sync:codex
```

## English

### What This Is

`ffmpeg-video-recreator` is a Codex skill that helps analyze videos for AI-assisted recreation.

It can:

- Check or install FFmpeg on macOS and Windows.
- Create an isolated workspace for each video-analysis task.
- Read technical video metadata with `ffprobe`.
- Extract representative keyframes with `ffmpeg`.
- Generate a recreate-ready report, shot list, script, storyboard notes, and AI video prompt pack from the extracted frames and metadata.

The goal is to produce a report that another AI video tool can use to recreate the source video while intentionally modifying selected elements.

### How It Works

```text
Source video folder
  ↓
ffprobe metadata extraction
  ↓
ffmpeg keyframe extraction
  ↓
Codex reviews frames + metadata
  ↓
Recreate report / script / shot list / AI prompts
```

The AI does not directly read the raw video stream by default. It reads FFmpeg-generated image frames and structured metadata.

### Install in Codex

Ask Codex:

```text
Install $ffmpeg-video-recreator from https://github.com/ninemouth/ffmpeg-video-recreator and verify it.
```

Manual equivalent:

```bash
git clone https://github.com/ninemouth/ffmpeg-video-recreator.git
cd ffmpeg-video-recreator
node scripts/install-or-update-from-github.mjs
```

The installed skill is synced to:

```text
${CODEX_HOME}/skills/ffmpeg-video-recreator
```

If `CODEX_HOME` is not set:

```text
~/.codex/skills/ffmpeg-video-recreator
```

### Update in Codex

Ask Codex:

```text
Update $ffmpeg-video-recreator from GitHub and verify the installed skill is current.
```

Manual equivalent:

```bash
cd ffmpeg-video-recreator
node scripts/install-or-update-from-github.mjs --update
```

Check whether the installed copy is behind GitHub:

```bash
node ~/.codex/skills/ffmpeg-video-recreator/scripts/check-skill-update.mjs
```

### Use the Skill in Codex

After installation, ask Codex:

```text
Use $ffmpeg-video-recreator to analyze all videos in /path/to/video-folder, extract keyframes, and write a recreate-ready report. Include a summary, shot breakdown, script reconstruction, storyboard-style shot list, AI video prompts, and a modification plan.
```

More specific example:

```text
Use $ffmpeg-video-recreator to analyze all videos in ~/Desktop/video-samples. Create an isolated run directory, check or install ffmpeg, extract keyframes in hybrid mode, then write output/recreate-report.md from the frames and metadata. The report should help another AI recreate the video while changing the subject to an Asian woman in an office and preserving the original pacing and camera language.
```

### Manual Usage

Create an isolated run directory:

```bash
node scripts/create-run-skeleton.mjs --input "/path/to/video-folder" --slug "video-remake"
```

Check FFmpeg:

```bash
node scripts/install-ffmpeg.mjs --check
```

Install FFmpeg if missing:

```bash
node scripts/install-ffmpeg.mjs --install
```

Extract keyframes:

```bash
node scripts/extract-keyframes.mjs \
  --input "/path/to/video-folder" \
  --run "work/runs/<run-id>" \
  --mode hybrid \
  --interval 2 \
  --scene-threshold 0.32
```

Output structure:

```text
work/runs/<run-id>/
├── input/
├── frames/
├── metadata/
│   ├── manifest.json
│   ├── frame-index.json
│   └── *.ffprobe.json
├── output/
│   └── recreate-report.md
└── qa/
```

### Extraction Modes

- `hybrid`: Recommended default. Combines scene-change and interval sampling.
- `scene`: Uses visual scene changes. Best for fast edits, ads, music videos, and cinematic cuts.
- `interval`: Samples at fixed time intervals. Best for tutorials, screen recordings, lectures, and long static scenes.

### Report Contents

Use [references/report-contract.md](references/report-contract.md) as the report contract. A complete report should include:

- Source inventory and technical metadata.
- Executive summary.
- Timeline and shot-by-shot reconstruction.
- Visual DNA: framing, motion, lighting, color, rhythm, captions, and transitions.
- Recreate-ready script and storyboard notes.
- Master prompt and per-shot prompts for AI video generation.
- Modification plan separating preserved elements from editable elements.
- Gaps, risks, and QA notes.

### Current Boundaries

- The skill detects audio streams but does not transcribe audio yet.
- Voiceover, dialogue, music, and sound effects require visible subtitle cues, visual inference, or a future ASR/Whisper extension.
- For very fast edits, reduce `--scene-threshold` or shorten `--interval`.

### Development

Verify:

```bash
npm run verify
```

Sync into local Codex skills:

```bash
npm run sync:codex
```

## License

MIT
