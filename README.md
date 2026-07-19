# FFmpeg Video Recreator

Codex skill for FFmpeg-based video keyframe extraction and recreate-ready video reports.

`ffmpeg-video-recreator` helps Codex analyze videos without asking the AI to read the raw video directly. The deterministic layer uses `ffmpeg` and `ffprobe` to inspect videos, extract keyframes, and create structured run artifacts. Codex then reviews the extracted frames and metadata to write a language-matched report, script, shot list, and prompt pack that another AI can use to recreate or modify the video.

The GitHub installer also installs the companion [`video-frame-image-asset-generator`](https://github.com/ninemouth/video-frame-image-asset-generator) skill. That companion turns extracted frames and recreate reports into clean still-image assets such as empty scene plates, UI-free scene reconstructions, plain-background multi-angle character references, wardrobe/prop cutouts, prompt packs, request packs, and generated images through Codex native image generation or a configured OpenAI-compatible third-party image API.

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

安装/更新本 skill 时，安装器会默认同步独立的图片资产 companion skill：[`video-frame-image-asset-generator`](https://github.com/ninemouth/video-frame-image-asset-generator)。它负责把抽帧画面和复刻报告继续转换成干净空场景、去 UI 场景、多角度人物纯色背景、服装/道具 cutout、prompt pack、request pack，以及可通过 Codex 原生生图或第三方 OpenAI-compatible API 生成的图片资产。

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

同时会自动安装/更新 companion 图片 skill 到：

```text
${CODEX_HOME}/skills/video-frame-image-asset-generator
```

如果没有设置 `CODEX_HOME`，默认是：

```text
~/.codex/skills/ffmpeg-video-recreator
```

第三方图片 API 配置会写入本地文件：

```text
${CODEX_HOME}/video-frame-image-asset-generator/image-provider.json
```

如果没有设置 `CODEX_HOME`，默认是：

```text
~/.codex/video-frame-image-asset-generator/image-provider.json
```

安装/更新过程中，如果没有通过参数或环境变量提供第三方图片 provider 的 base URL 和 API key，脚本会在可交互终端中提示输入。默认 base URL 是 `https://www.thinkai.tv/v1`，默认模型是 `gpt-image-2`。如果暂时不配置 key，仍可使用 Codex 原生 `imagegen` 路径；第三方 API 路径会保持未配置状态。

非交互安装时可以显式传入：

```bash
node scripts/install-or-update-from-github.mjs \
  --image-provider-base-url "https://www.thinkai.tv/v1" \
  --image-provider-api-key "<API_KEY>"
```

如果只想安装 FFmpeg 分析能力，不安装 companion 图片 skill，可传：

```bash
node scripts/install-or-update-from-github.mjs --no-companion-image-skill
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

抽取关键帧并执行本地音频分析：

```bash
node scripts/extract-keyframes.mjs \
  --input "/path/to/video-folder" \
  --run "work/runs/<run-id>" \
  --mode hybrid \
  --language zh \
  --interval 2 \
  --scene-threshold 0.32
```

这个命令默认会执行三层音频流程：

1. `audio-probe`：用 `ffprobe` 获取音频轨，并用 `ffmpeg` 抽取 16 kHz mono WAV。
2. `audio-signal-analysis`：用 FFmpeg/librosa 做静音、响度、峰值、节奏、频谱、音量曲线分析，不需要 AI/GPU。
3. `optional-audio-ai`：本地离线探测 ASR 和声音事件模型；不可用时写入 `skipped`，不阻塞主流程。

如需单独运行：

```bash
node scripts/install-audio-support.mjs --profile signal
node scripts/analyze-audio.mjs --input "/path/to/video-folder" --run "work/runs/<run-id>" --language zh
node scripts/transcribe-audio.mjs --run "work/runs/<run-id>" --provider auto --model auto --quality balanced --language zh
node scripts/classify-audio-events.mjs --run "work/runs/<run-id>" --provider auto --language zh
```

正常主流程不要求用户预先执行安装命令。只要硬件和系统条件支持，skill 会自动安装、部署、运行并自检；只有确实不支持时才写入明确的 skipped reason。`analyze-audio.mjs` 会在缺少 `librosa` 时自动安装 `signal` profile；`transcribe-audio.mjs` 在 `auto` 模式下会按硬件自动尝试安装合适的本地 ASR provider：Apple Silicon/CPU 优先 `whisper.cpp` + 本地 ggml 模型，NVIDIA CUDA 优先 `faster-whisper`。`classify-audio-events.mjs` 会自动安装 TensorFlow / TensorFlow Hub 并运行本地 YAMNet 声音事件识别。

`install-audio-support.mjs` 是调试和显式预安装入口，会在 skill 目录创建 `.venv-audio/` 和 `.models/`，不污染系统 Python。可选 profile：

- `--profile signal`：安装 librosa 等节奏/频谱分析依赖，推荐默认安装。
- `--profile asr-whisper-cpp`：在 macOS/Homebrew 环境自动安装 `whisper.cpp`，并下载本地 ggml 模型。Apple Silicon/CPU 的最低硬件门槛方案。
- `--profile asr-faster-whisper`：安装本地 faster-whisper ASR，适合 NVIDIA CUDA 或愿意 CPU int8 跑 ASR 的机器。
- `--profile asr-openai-whisper`：安装 OpenAI Whisper Python 本地包。
- `--profile events`：安装 TensorFlow / TensorFlow Hub，给后续 YAMNet 类本地声音事件模型准备环境。
- `--profile all`：安装以上全部，体积较大，不建议默认使用。

完整本地音频能力自检：

```bash
npm run audio:self-check
```

自检会临时生成一个带音频的视频，并验证 FFmpeg/librosa 信号分析、whisper.cpp ASR、YAMNet 声音事件识别是否端到端可用。

本地 ASR 自动选择策略：

- CPU / Apple Silicon：优先 `whisper.cpp`。`whisper.cpp` 需要通过 `--model /path/to/model.bin` 或 `WHISPER_CPP_MODEL` 指定本地模型文件。
- 主流程 auto 模式会优先使用 skill 自己下载到 `.models/whisper.cpp/` 的模型，因此通常不需要手动设置 `WHISPER_CPP_MODEL`。
- NVIDIA CUDA：优先 `faster-whisper`，然后 Qwen3-ASR，再回退到 `whisper.cpp`。
- Qwen3-ASR 是 CUDA 机器上的高级可选 provider。
- API provider 默认禁用，本项目不会在自动流程里调用 API。
- 没有可用本地 ASR 时，`metadata/speech-transcript.json` 会记录 `skipped`。

OCR 只作为画面可见文字的备选能力：字幕、标题、贴纸字、商品文案、UI 文案等。OCR 不会替代语音识别，也不会被当作语音字幕来源。

输出目录结构：

```text
work/runs/<run-id>/
├── input/
├── frames/
├── audio/
├── metadata/
│   ├── manifest.json
│   ├── frame-index.json
│   ├── frame-quality.json
│   ├── audio-streams.json
│   ├── audio-analysis.json
│   ├── speech-transcript.json
│   ├── audio-events.json
│   └── *.ffprobe.json
├── output/
│   ├── README.md
│   ├── keyframes/
│   ├── recreation-pack/
│   │   ├── segment-plan.md
│   │   ├── continuity-locks.md
│   │   └── segments/
│   ├── keyframes-index.md
│   ├── delivery-manifest.json
│   ├── report-contract-check.json
│   ├── audio-analysis.md
│   ├── speech-transcript.md
│   ├── audio-events.md
│   └── recreate-report.md
└── qa/
```

`output/` 是最终交付包。`frames/` 是原始抽帧目录，`output/keyframes/` 是完整关键帧交付目录，`output/recreation-pack/` 是可以独立交给 AI 视频工具或创作者的复刻包。contact sheet 如果存在，只能作为浏览辅助，不能替代单张关键帧或独立复刻包。

最终回复应优先照 `output/README.md` 和 `output/delivery-manifest.json` 里的 `direct_access` 顺序提供直接入口，不要只列“重点文件”。固定入口包括完整交付目录、交付入口索引、复刻报告、AI 视频复刻交接包、分段连续性方案、连续性锁定规则、完整关键帧目录、关键帧索引、机器可读交付清单、报告契约校验结果，以及默认音频管线生成的音频分析/语音转写/音频事件状态。

写完 `output/recreate-report.md` 后，运行 `node scripts/validate-report-contract.mjs --run "work/runs/<run-id>"`。只有 `output/report-contract-check.json` 的 `status` 为 `passed` 时，才算完成可交付报告。

分段生成时，优先使用：

- `output/recreation-pack/segment-plan.md`：每段的起止帧、上一段结束帧锚点、生成备注。
- `output/recreation-pack/continuity-locks.md`：跨段连续性锁定项和边界 QA。
- `output/recreation-pack/segments/<segment-id>/previous-segment-end-frame.jpg`：后一段生成时引用的上一段结束帧。
- `output/recreation-pack/segments/<segment-id>/start-frame.jpg` 和 `end-frame.jpg`：本段起止视觉参考。

### 抽帧模式

- `hybrid`：默认推荐。结合场景变化和固定间隔抽帧，适合大多数广告、短视频、产品视频。
- `scene`：基于画面变化抽帧，适合剪辑密集、镜头切换明显的视频。
- `interval`：按固定时间间隔抽帧，适合教程、录屏、讲解、长静态画面。

默认开启轻量关键帧质量过滤：脚本先用 FFmpeg 抽候选帧，再用 FFmpeg 将候选 JPEG 解码为小尺寸灰度 raw buffer，由 Node 计算黑像素占比、白像素占比、亮度方差和边缘变化，过滤黑场、白场、低信息转场帧，并优先从相邻时间点补采替代帧。结果记录在 `metadata/frame-quality.json`。如果源片故意使用黑底字幕或低亮度标题卡，可用 `--no-frame-quality` 关闭，或用 `--max-black-ratio`、`--max-white-ratio`、`--min-luma-stddev` 调整阈值。

### 报告内容

最终报告应参考 [references/report-contract.md](references/report-contract.md)，至少包含：

- 源视频清单和技术 metadata。
- 关键帧交付目录和关键帧索引。
- 独立复刻包目录和其中的 brief、shot list、prompts、修改方案、参考帧。
- 分段生成连续性方案，包括前段结束帧锚点和 prompt 控制规则。
- 音频证据：`audio-streams.json`、`audio-analysis.json`、`speech-transcript.json`、`audio-events.json`。
- 视频整体总结。
- 时间线和镜头拆解。
- 画面风格、构图、光线、色彩、节奏、字幕和转场分析。
- 可复刻剧本和分镜脚本。
- AI 视频生成 master prompt 和逐镜头 prompt。
- 可修改项与必须保留项。
- 缺失信息和 QA 风险。

报告语言应跟随用户交互语言。中文任务输出中文报告、中文关键帧备注和中文 prompt；英文任务输出英文报告。

### 当前边界

- 非 AI 音频信号分析默认可用，但依赖本地 `ffmpeg`/`ffprobe`。
- ASR 只使用本地离线 provider。没有 `whisper.cpp` 模型、`faster-whisper`、OpenAI Whisper Python 包或 Qwen3-ASR 本地环境时，会跳过语音转写。
- 声音事件 AI provider 目前只做本地能力探测和 skipped 状态记录；仍可使用非 AI 音频信号分析判断静音、响度、峰值和节奏。
- OCR 只用于画面可见文字，不替代 ASR。
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

Install/update also syncs the companion [`video-frame-image-asset-generator`](https://github.com/ninemouth/video-frame-image-asset-generator) skill. The companion turns extracted frames and recreate reports into clean still-image assets: scene plates, UI-free reconstructions, plain-background multi-angle character references, wardrobe/prop cutouts, prompt packs, request packs, and generated images through Codex native image generation or a configured OpenAI-compatible third-party API.

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

The companion image skill is also installed or updated to:

```text
${CODEX_HOME}/skills/video-frame-image-asset-generator
```

If `CODEX_HOME` is not set:

```text
~/.codex/skills/ffmpeg-video-recreator
```

Third-party image provider configuration is stored locally at:

```text
${CODEX_HOME}/video-frame-image-asset-generator/image-provider.json
```

If `CODEX_HOME` is not set:

```text
~/.codex/video-frame-image-asset-generator/image-provider.json
```

During install/update, if no base URL or API key is supplied through arguments or environment variables, the installer prompts for them in an interactive terminal. The default base URL is `https://www.thinkai.tv/v1`; the default model is `gpt-image-2`. If no key is configured yet, Codex-native `imagegen` remains available and the third-party API route stays unconfigured.

Non-interactive install example:

```bash
node scripts/install-or-update-from-github.mjs \
  --image-provider-base-url "https://www.thinkai.tv/v1" \
  --image-provider-api-key "<API_KEY>"
```

To install only FFmpeg analysis without the companion image skill:

```bash
node scripts/install-or-update-from-github.mjs --no-companion-image-skill
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

Extract keyframes and run local audio analysis:

```bash
node scripts/extract-keyframes.mjs \
  --input "/path/to/video-folder" \
  --run "work/runs/<run-id>" \
  --mode hybrid \
  --language en \
  --interval 2 \
  --scene-threshold 0.32
```

This command runs three audio layers by default:

1. `audio-probe`: `ffprobe` inventories audio streams and `ffmpeg` extracts 16 kHz mono WAV files.
2. `audio-signal-analysis`: FFmpeg/librosa analyze silence, loudness, peaks, rhythm, spectrum, and volume curves without AI/GPU.
3. `optional-audio-ai`: local-only ASR and sound-event provider detection. Unsupported providers are written as `skipped` and never block the workflow.

Run the layers manually:

```bash
node scripts/install-audio-support.mjs --profile signal
node scripts/analyze-audio.mjs --input "/path/to/video-folder" --run "work/runs/<run-id>" --language en
node scripts/transcribe-audio.mjs --run "work/runs/<run-id>" --provider auto --model auto --quality balanced --language en
node scripts/classify-audio-events.mjs --run "work/runs/<run-id>" --provider auto --language en
```

The normal workflow does not require users to pre-run install commands. When hardware and system conditions support it, the skill should install, deploy, run, and self-check automatically; unsupported cases must write a clear skipped reason. `analyze-audio.mjs` auto-installs the `signal` profile when `librosa` is missing; `transcribe-audio.mjs` auto-installs the best local ASR provider for the hardware in `auto` mode: Apple Silicon/CPU prefer `whisper.cpp` plus a local ggml model, while NVIDIA CUDA prefers `faster-whisper`. `classify-audio-events.mjs` auto-installs TensorFlow / TensorFlow Hub and runs local YAMNet sound-event classification.

`install-audio-support.mjs` is still available for debugging and explicit pre-installation. It creates `.venv-audio/` and `.models/` inside the skill without polluting system Python. Optional profiles:

- `--profile signal`: librosa-based rhythm/spectrum analysis; recommended default.
- `--profile asr-whisper-cpp`: install `whisper.cpp` with Homebrew on macOS and download a local ggml model. Lowest hardware requirement for Apple Silicon/CPU.
- `--profile asr-faster-whisper`: local faster-whisper ASR for NVIDIA CUDA or CPU int8 users.
- `--profile asr-openai-whisper`: local OpenAI Whisper Python package.
- `--profile events`: TensorFlow / TensorFlow Hub for future local YAMNet-style event classification.
- `--profile all`: all optional packages; large, not recommended as the default.

End-to-end local audio self-check:

```bash
npm run audio:self-check
```

The self-check creates a temporary synthetic video and verifies FFmpeg/librosa signal analysis, whisper.cpp ASR, and YAMNet sound-event classification.

Local ASR auto-selection:

- CPU / Apple Silicon prefer `whisper.cpp`. `whisper.cpp` needs a local model path through `--model /path/to/model.bin` or `WHISPER_CPP_MODEL`.
- In auto mode, the workflow uses the model downloaded into `.models/whisper.cpp/`, so `WHISPER_CPP_MODEL` is usually unnecessary.
- NVIDIA CUDA prefers `faster-whisper`, then Qwen3-ASR, then `whisper.cpp`.
- Qwen3-ASR is an advanced optional provider for CUDA-capable machines.
- API providers are disabled by default and are not used by the automatic workflow.
- If no local ASR provider is available, `metadata/speech-transcript.json` records `skipped`.

OCR remains a visible-text-only fallback for captions, titles, stickers, product copy, and UI text. OCR is not used as a replacement for speech recognition.

Output structure:

```text
work/runs/<run-id>/
├── input/
├── frames/
├── audio/
├── metadata/
│   ├── manifest.json
│   ├── frame-index.json
│   ├── frame-quality.json
│   ├── audio-streams.json
│   ├── audio-analysis.json
│   ├── speech-transcript.json
│   ├── audio-events.json
│   └── *.ffprobe.json
├── output/
│   ├── README.md
│   ├── keyframes/
│   ├── recreation-pack/
│   │   ├── segment-plan.md
│   │   ├── continuity-locks.md
│   │   └── segments/
│   ├── keyframes-index.md
│   ├── delivery-manifest.json
│   ├── report-contract-check.json
│   ├── audio-analysis.md
│   ├── speech-transcript.md
│   ├── audio-events.md
│   └── recreate-report.md
└── qa/
```

`output/` is the final delivery package. `frames/` stores the raw extracted frames, `output/keyframes/` stores the complete keyframe delivery, and `output/recreation-pack/` is the standalone package intended for AI video tools or creative operators. A contact sheet, if generated, is only a navigation aid and does not replace individual keyframes or the recreation pack.

Final replies should follow the `direct_access` order in `output/README.md` and `output/delivery-manifest.json` instead of listing only "important files." The stable entries include the complete delivery directory, delivery index, recreate report, AI video recreation pack, segment continuity plan, continuity locks, complete keyframes directory, keyframe index, machine-readable delivery manifest, report contract check, and the audio analysis / speech transcript / audio event status generated by the default audio pipeline.

After writing `output/recreate-report.md`, run `node scripts/validate-report-contract.mjs --run "work/runs/<run-id>"`. Treat the report as deliverable only when `output/report-contract-check.json` has `status: "passed"`.

For segmented generation, use:

- `output/recreation-pack/segment-plan.md`: segment start/end frames, previous-end anchors, and generation notes.
- `output/recreation-pack/continuity-locks.md`: cross-segment locks and boundary QA.
- `output/recreation-pack/segments/<segment-id>/previous-segment-end-frame.jpg`: previous segment ending frame for the next segment.
- `output/recreation-pack/segments/<segment-id>/start-frame.jpg` and `end-frame.jpg`: visual references for the current segment.

### Extraction Modes

- `hybrid`: Recommended default. Combines scene-change and interval sampling.
- `scene`: Uses visual scene changes. Best for fast edits, ads, music videos, and cinematic cuts.
- `interval`: Samples at fixed time intervals. Best for tutorials, screen recordings, lectures, and long static scenes.

Lightweight frame quality filtering is enabled by default. The script extracts candidate frames with FFmpeg, decodes each JPEG through FFmpeg into a small grayscale raw buffer, then computes black-pixel ratio, white-pixel ratio, luma variance, and edge variation in Node. Mostly black, mostly white, and near-empty transition frames are filtered, and nearby timestamps are sampled as replacements first. Results are written to `metadata/frame-quality.json`. Use `--no-frame-quality` for intentional black-background title cards, or tune `--max-black-ratio`, `--max-white-ratio`, and `--min-luma-stddev`.

### Report Contents

Use [references/report-contract.md](references/report-contract.md) as the report contract. A complete report should include:

- Source inventory and technical metadata.
- Keyframe delivery directory and keyframe index.
- Independent recreation pack with brief, shot list, prompts, modification plan, and reference frames.
- Segment continuity plan with previous-end-frame anchors and prompt control rules.
- Audio evidence from `audio-streams.json`, `audio-analysis.json`, `speech-transcript.json`, and `audio-events.json`.
- Executive summary.
- Timeline and shot-by-shot reconstruction.
- Visual DNA: framing, motion, lighting, color, rhythm, captions, and transitions.
- Recreate-ready script and storyboard notes.
- Master prompt and per-shot prompts for AI video generation.
- Modification plan separating preserved elements from editable elements.
- Gaps, risks, and QA notes.

The report language should match the user's interaction language. Chinese requests should receive Chinese reports, keyframe notes, and prompts; English requests should receive English reports.

### Current Boundaries

- Non-AI audio signal analysis is available by default and depends on local `ffmpeg`/`ffprobe`.
- ASR is local-only. If no `whisper.cpp` model, `faster-whisper`, OpenAI Whisper Python package, or Qwen3-ASR local runtime is available, speech transcription is skipped.
- Audio event AI currently records local provider detection and skipped status unless a local YAMNet/PANNs/CLAP runner is wired in. Non-AI signal analysis still covers silence, loudness, peaks, and rhythm.
- OCR is visible-text-only and does not replace ASR.
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

## Open Source Usage Guidelines / 开源使用规范

This project is released under the MIT License. You may use, copy, modify,
merge, publish, distribute, sublicense, and sell copies of this software,
including commercial use, as long as you keep the copyright notice and license
text in all copies or substantial portions of the software.

Recommended attribution:

```text
FFmpeg Video Recreator
Copyright (c) 2026 Yang Cao <cao.x.yang@gmail.com>
Licensed under the MIT License.
```

When redistributing source files, keep the existing SPDX header where present:

```text
Copyright (c) 2026 Yang Cao <cao.x.yang@gmail.com>
SPDX-License-Identifier: MIT
```

This project is provided as-is, without warranty. FFmpeg itself is a separate
third-party project with its own license terms. If you install or redistribute
FFmpeg, you are responsible for complying with the applicable FFmpeg build and
codec licenses.

本项目基于 MIT 许可证开源。你可以使用、复制、修改、合并、发布、分发、再许可和
销售本软件副本，也可以用于商业用途；前提是在软件的所有副本或主要部分中保留版权
声明和许可协议文本。

建议保留以下署名：

```text
FFmpeg Video Recreator
Copyright (c) 2026 Yang Cao <cao.x.yang@gmail.com>
Licensed under the MIT License.
```

再次分发源代码文件时，请保留已有的 SPDX 头部声明：

```text
Copyright (c) 2026 Yang Cao <cao.x.yang@gmail.com>
SPDX-License-Identifier: MIT
```

本项目按原样提供，不附带任何形式的担保。FFmpeg 是独立的第三方项目，拥有自己的
许可证条款；如果安装或再分发 FFmpeg，请自行确认并遵守对应 FFmpeg 构建和编解码器
许可证要求。

## License

MIT License. See [LICENSE](LICENSE) for the full English license text and a
Chinese reference translation.

Copyright (c) 2026 Yang Cao <cao.x.yang@gmail.com>
