# FFmpeg Installation Script for Windows
Write-Host "Downloading FFmpeg for Windows..." -ForegroundColor Green

$url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
$zipPath = Join-Path $PSScriptRoot "ffmpeg-temp.zip"
$extractPath = Join-Path $PSScriptRoot "temp"

try {
    # Download
    Write-Host "Downloading from $url..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
    
    # Extract
    Write-Host "Extracting archive..." -ForegroundColor Yellow
    Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force
    
    # Find the ffmpeg folder (version number may vary)
    $ffmpegFolder = Get-ChildItem -Path $extractPath -Directory | Where-Object { $_.Name -like "ffmpeg-*" } | Select-Object -First 1
    
    if ($ffmpegFolder) {
        $binPath = Join-Path $ffmpegFolder.FullName "bin"
        
        # Copy executables
        Write-Host "Copying ffmpeg.exe and ffprobe.exe..." -ForegroundColor Yellow
        Copy-Item (Join-Path $binPath "ffmpeg.exe") -Destination (Join-Path $PSScriptRoot "ffmpeg.exe") -Force
        Copy-Item (Join-Path $binPath "ffprobe.exe") -Destination (Join-Path $PSScriptRoot "ffprobe.exe") -Force
        
        Write-Host "FFmpeg installed successfully!" -ForegroundColor Green
        Write-Host "Location: $PSScriptRoot" -ForegroundColor Cyan
    } else {
        Write-Host "Error: Could not find ffmpeg folder in extracted archive" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
} finally {
    # Cleanup
    Write-Host "Cleaning up temporary files..." -ForegroundColor Yellow
    if (Test-Path $extractPath) {
        Remove-Item $extractPath -Recurse -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path $zipPath) {
        Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "Done!" -ForegroundColor Green

