# Starts the Blue Balance API on port 8000. Start Ollama first with scripts\start-ollama.ps1.
# Whisper turbo lives on F: (C: is nearly full); download it with: python eval\download_whisper.py
$whisper = 'F:\models\whisper-large-v3-turbo'
if (Test-Path "$whisper\model.bin") { $env:BB_WHISPER = $whisper }
Set-Location (Split-Path $PSScriptRoot -Parent)
# Optional keys (git-ignored), e.g. OPENROUTER_API_KEY=... turns on the hosted open model.
if (Test-Path .env.local) {
    Get-Content .env.local | Where-Object { $_ -match '^\s*([A-Z_]+)\s*=\s*(.+)$' } | ForEach-Object { Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2].Trim() }
}
python -m uvicorn api.main:app --host 127.0.0.1 --port 8000 --no-access-log
