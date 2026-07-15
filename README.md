# FFmpeg Video Recreator

Codex skill for FFmpeg-based video keyframe extraction and recreate-ready video reports.

`ffmpeg-video-recreator` helps Codex analyze videos without asking the AI to read the raw video directly. The deterministic layer uses `ffmpeg` and `ffprobe` to inspect videos, extract keyframes, and create structured run artifacts. Codex then reviews the extracted frames and metadata to write a language-matched report, script, shot list, and prompt pack that another AI can use to recreate or modify the video.

中文说明见下方。English documentation follows after the Chinese section.

## 中文说明

### 这是什么

这是一个可在 Codex 中使用的 skill，用于：

- 在 macOS 或 Windows 下检查/安装 FFmpeg。
- 为每个视频分析任务创建独立工作目录和输出目录。
- 对指定目录下的视频批量读取 metadata。
- 使用 FFmpeg 抽取关键帧，而不是让 AI 直接读取原视频流。
- 将关键帧作为正式交付资产复制到 `output/keyframes/`。
- 基于关键帧和 metadata 生成符合用户交互语言的可复刻创作报告，包括总结、镜头拆解、剧本、脚本、AI 视频生成提示词和修改方案。

核心目标是得到一个完整交付包，而不只是一张 contact sheet 或一份报告。交付包里的关键帧、索引、metadata 和报告可以一起用于分析；真正交给 AI 视频工具或创作者复刻时，优先使用独立的 `output/recreation-pack/`。因为 AI 视频通常需要分段生成，复刻包会额外提供分段计划、上一段结束帧锚点和连续性锁定 prompt。

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
生成关键帧交付包 / 可复刻报告 / 剧本 / 镜头脚本 / AI 生成 prompt
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
使用 $ffmpeg-video-recreator 分析 /path/to/video-folder 下的视频，抽取关键帧，并生成一份可以让 AI 分段复刻该视频的中文交付包。交付包需要包含 output/keyframes/ 完整关键帧、output/recreation-pack/ 独立复刻包、segment-plan、continuity-locks、上一段结束帧锚点、关键帧索引、delivery manifest、视频总结、镜头拆解、剧本、分镜脚本、AI 生成提示词，以及我可以修改哪些内容。
```

更具体的示例：

```text
使用 $ffmpeg-video-recreator 分析 ~/Desktop/video-samples 下的所有视频。请创建独立任务目录，先确认或安装 ffmpeg，使用 hybrid 模式抽取关键帧，并按中文交互语言输出。请交付 output/keyframes/、output/recreation-pack/、output/keyframes-index.md、output/delivery-manifest.json 和 output/recreate-report.md。复刻包必须支持分段生成：后一段使用前一段结束关键帧作为连续性锚点，并用 continuity-locks 控制人物/产品身份、镜头、光线、场景、字幕和运动方向。报告用中文写，目标是让另一个 AI 视频工具可以复刻原视频，但把人物换成亚洲女性、背景换成办公室、保留原视频节奏和镜头语言。
```

英文示例：

```text
Use $ffmpeg-video-recreator to analyze all videos in ~/Desktop/video-samples. Create an isolated run directory, check or install ffmpeg, extract keyframes in hybrid mode, and match the report language to this English request. Deliver output/keyframes/, output/recreation-pack/, output/keyframes-index.md, output/delivery-manifest.json, and output/recreate-report.md. The recreation pack should help another AI recreate the video while changing the subject to an Asian woman in an office and preserving the original pacing and camera language.
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
  --language zh \
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
│   ├── keyframes/
│   ├── recreation-pack/
│   │   ├── segment-plan.md
│   │   ├── continuity-locks.md
│   │   └── segments/
│   ├── keyframes-index.md
│   ├── delivery-manifest.json
│   └── recreate-report.md
└── qa/
```

`output/` 是最终交付包。`frames/` 是原始抽帧目录，`output/keyframes/` 是完整关键帧交付目录，`output/recreation-pack/` 是可以独立交给 AI 视频工具或创作者的复刻包。contact sheet 如果存在，只能作为浏览辅助，不能替代单张关键帧或独立复刻包。

分段生成时，优先使用：

- `output/recreation-pack/segment-plan.md`：每段的起止帧、上一段结束帧锚点、生成备注。
- `output/recreation-pack/continuity-locks.md`：跨段连续性锁定项和边界 QA。
- `output/recreation-pack/segments/<segment-id>/previous-segment-end-frame.jpg`：后一段生成时引用的上一段结束帧。
- `output/recreation-pack/segments/<segment-id>/start-frame.jpg` 和 `end-frame.jpg`：本段起止视觉参考。

### 抽帧模式

- `hybrid`：默认推荐。结合场景变化和固定间隔抽帧，适合大多数广告、短视频、产品视频。
- `scene`：基于画面变化抽帧，适合剪辑密集、镜头切换明显的视频。
- `interval`：按固定时间间隔抽帧，适合教程、录屏、讲解、长静态画面。

### 报告内容

最终报告应参考 [references/report-contract.md](references/report-contract.md)，至少包含：

- 源视频清单和技术 metadata。
- 关键帧交付目录和关键帧索引。
- 独立复刻包目录和其中的 brief、shot list、prompts、修改方案、参考帧。
- 分段生成连续性方案，包括前段结束帧锚点和 prompt 控制规则。
- 视频整体总结。
- 时间线和镜头拆解。
- 画面风格、构图、光线、色彩、节奏、字幕和转场分析。
- 可复刻剧本和分镜脚本。
- AI 视频生成 master prompt 和逐镜头 prompt。
- 可修改项与必须保留项。
- 缺失信息和 QA 风险。

报告语言应跟随用户交互语言。中文任务输出中文报告、中文关键帧备注和中文 prompt；英文任务输出英文报告。

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
- Deliver individual keyframes under `output/keyframes/`.
- Generate a language-matched recreate-ready report, shot list, script, storyboard notes, and AI video prompt pack from the extracted frames and metadata.

The goal is to produce a complete delivery package, not only a contact sheet or report. The package includes keyframes, an index, metadata, and a report for analysis. For actual handoff to an AI video tool or creator, use the independent `output/recreation-pack/`. Because AI video is usually generated in segments, the pack also includes a segment plan, previous-end-frame anchors, and continuity-lock prompts.

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
Keyframe delivery / recreate report / script / shot list / AI prompts
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
Use $ffmpeg-video-recreator to analyze all videos in /path/to/video-folder, extract keyframes, and write a segmented recreate-ready delivery package. Include output/keyframes/, output/recreation-pack/, segment-plan, continuity-locks, previous-end-frame anchors, a keyframe index, delivery manifest, summary, shot breakdown, script reconstruction, storyboard-style shot list, AI video prompts, and a modification plan.
```

More specific example:

```text
Use $ffmpeg-video-recreator to analyze all videos in ~/Desktop/video-samples. Create an isolated run directory, check or install ffmpeg, extract keyframes in hybrid mode, and match the report language to this English request. Deliver output/keyframes/, output/recreation-pack/, output/keyframes-index.md, output/delivery-manifest.json, and output/recreate-report.md. The recreation pack should help another AI recreate the video while changing the subject to an Asian woman in an office and preserving the original pacing and camera language.
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
  --language en \
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
│   ├── keyframes/
│   ├── recreation-pack/
│   │   ├── segment-plan.md
│   │   ├── continuity-locks.md
│   │   └── segments/
│   ├── keyframes-index.md
│   ├── delivery-manifest.json
│   └── recreate-report.md
└── qa/
```

`output/` is the final delivery package. `frames/` stores the raw extracted frames, `output/keyframes/` stores the complete keyframe delivery, and `output/recreation-pack/` is the standalone package intended for AI video tools or creative operators. A contact sheet, if generated, is only a navigation aid and does not replace individual keyframes or the recreation pack.

For segmented generation, use:

- `output/recreation-pack/segment-plan.md`: segment start/end frames, previous-end anchors, and generation notes.
- `output/recreation-pack/continuity-locks.md`: cross-segment locks and boundary QA.
- `output/recreation-pack/segments/<segment-id>/previous-segment-end-frame.jpg`: previous segment ending frame for the next segment.
- `output/recreation-pack/segments/<segment-id>/start-frame.jpg` and `end-frame.jpg`: visual references for the current segment.

### Extraction Modes

- `hybrid`: Recommended default. Combines scene-change and interval sampling.
- `scene`: Uses visual scene changes. Best for fast edits, ads, music videos, and cinematic cuts.
- `interval`: Samples at fixed time intervals. Best for tutorials, screen recordings, lectures, and long static scenes.

### Report Contents

Use [references/report-contract.md](references/report-contract.md) as the report contract. A complete report should include:

- Source inventory and technical metadata.
- Keyframe delivery directory and keyframe index.
- Independent recreation pack with brief, shot list, prompts, modification plan, and reference frames.
- Segment continuity plan with previous-end-frame anchors and prompt control rules.
- Executive summary.
- Timeline and shot-by-shot reconstruction.
- Visual DNA: framing, motion, lighting, color, rhythm, captions, and transitions.
- Recreate-ready script and storyboard notes.
- Master prompt and per-shot prompts for AI video generation.
- Modification plan separating preserved elements from editable elements.
- Gaps, risks, and QA notes.

The report language should match the user's interaction language. Chinese requests should receive Chinese reports, keyframe notes, and prompts; English requests should receive English reports.

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
