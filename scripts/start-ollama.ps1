# Restarts Ollama with one request slot so qwen2.5:7b fits beside Whisper on an 8 GB GPU.
# OLLAMA_NUM_PARALLEL is read by the Ollama server, so it must be set here, not in the API.
Get-Process -Name 'ollama*' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
$env:OLLAMA_NUM_PARALLEL = '1'
$env:OLLAMA_KEEP_ALIVE = '-1'
ollama serve
