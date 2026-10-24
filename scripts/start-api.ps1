# Starts the Blue Balance API on port 8000. Start Ollama first with scripts\start-ollama.ps1.
# Whisper turbo lives on F: (C: is nearly full); download it with: python eval\download_whisper.py
$whisper = 'F:\models\whisper-large-v3-turbo'
if (Test-Path "$whisper\model.bin") { $env:BB_WHISPER = $whisper }
Set-Location (Split-Path $PSScriptRoot -Parent)
python -m uvicorn api.main:app --host 127.0.0.1 --port 8000 --no-access-log
