# FFmpeg Video Recreator

Codex skill package for installing/locating FFmpeg, extracting keyframes from video folders, and producing recreate-ready reports for AI video remakes.

## Install with Codex

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

## Update

```bash
cd ffmpeg-video-recreator
node scripts/install-or-update-from-github.mjs --update
```

## Use

```bash
node scripts/create-run-skeleton.mjs --input "/path/to/video-folder" --slug "video-remake"
node scripts/install-ffmpeg.mjs --check
node scripts/extract-keyframes.mjs --input "/path/to/video-folder" --run "work/runs/<run-id>" --mode hybrid
```

Then fill `output/recreate-report.md` using `references/report-contract.md`.

## Verify

```bash
npm run verify
```

## License

MIT
