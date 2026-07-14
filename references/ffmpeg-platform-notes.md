# FFmpeg Platform Notes

The bundled installer script is intentionally conservative. It checks for an existing `ffmpeg` first and only installs when explicitly run with `--install`.

## macOS

Preferred installation path:

```bash
brew install ffmpeg
```

If Homebrew is missing, install Homebrew first from the official installer, then rerun the script. The script does not silently install Homebrew because that changes the user's shell environment.

## Windows

Preferred installation order:

1. `winget install --id Gyan.FFmpeg -e --source winget`
2. `choco install ffmpeg -y`
3. `scoop install ffmpeg`

After installing, open a new shell if `ffmpeg` is still not found. Windows PATH refresh often requires a new terminal.

## Manual Verification

Run:

```bash
ffmpeg -version
ffprobe -version
```

Both tools should resolve. `extract-keyframes.mjs` needs both `ffmpeg` and `ffprobe`.
