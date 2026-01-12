# FFmpeg Binary Location

Place your FFmpeg executable here:

- **Windows**: `ffmpeg.exe` and `ffprobe.exe`
- **Mac/Linux**: `ffmpeg` and `ffprobe`

## Download FFmpeg

### Windows
1. Download from https://www.gyan.dev/ffmpeg/builds/ (recommended) or https://ffmpeg.org/download.html
2. Extract the zip file
3. Copy `ffmpeg.exe` and `ffprobe.exe` from the `bin` folder to this directory

### Mac
```bash
brew install ffmpeg
# Then copy the binaries:
cp /opt/homebrew/bin/ffmpeg tools/ffmpeg/
cp /opt/homebrew/bin/ffprobe tools/ffmpeg/
```

### Linux
```bash
# Download static build from https://johnvansickle.com/ffmpeg/
# Or install via package manager:
sudo apt-get install ffmpeg
# Then copy binaries to this directory
```

## Alternative: Environment Variable

You can also set the `FFMPEG_PATH` environment variable to point to your FFmpeg executable:

```bash
# Windows PowerShell
$env:FFMPEG_PATH = "C:\path\to\ffmpeg.exe"

# Mac/Linux
export FFMPEG_PATH="/usr/local/bin/ffmpeg"
```

The script will check in this order:
1. `FFMPEG_PATH` environment variable
2. `tools/ffmpeg/ffmpeg(.exe)` (bundled)
3. System PATH (`ffmpeg` command)

