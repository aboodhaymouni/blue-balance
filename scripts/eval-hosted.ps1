# Scores the hosted open model on the held-out set (about 20 short requests). Loads the key from .env.local.
Set-Location (Split-Path $PSScriptRoot -Parent)
Get-Content .env.local | Where-Object { $_ -match '^\s*([A-Z_]+)\s*=\s*(.+)$' } | ForEach-Object { Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2].Trim() }
python eval/run_eval.py --set test --engine hosted --no-fill
python eval/run_eval.py --set test --engine hosted
