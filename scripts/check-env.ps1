# Prints what Blue Balance needs from this machine: Python packages, Ollama models, GPU.
$ErrorActionPreference = 'Continue'
Write-Output "== time: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
Write-Output "== python"
python --version
python -c "import importlib.util as u; [print(m, bool(u.find_spec(m))) for m in ['fastapi','uvicorn','multipart','httpx','faster_whisper','ctranslate2','torch','pydantic']]"
Write-Output "== ollama"
try { (Invoke-RestMethod -Uri http://127.0.0.1:11434/api/tags -TimeoutSec 5).models | ForEach-Object { $_.name } } catch { Write-Output "ollama not answering: $($_.Exception.Message)" }
Write-Output "== whisper cache"
Get-ChildItem "$env:USERPROFILE\.cache\huggingface\hub" -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'whisper' } | ForEach-Object { $_.Name }
Write-Output "== node"
node --version
npm --version
Write-Output "== gpu"
nvidia-smi --query-gpu=name,memory.used,memory.total --format=csv
Write-Output "== done"
