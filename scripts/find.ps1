# Text search in web/src (the session's Grep tool is unavailable). Usage: find.ps1 "pattern"
param([string]$Pattern)
Get-ChildItem -Recurse -File (Join-Path (Split-Path $PSScriptRoot -Parent) 'web\src') | Select-String -Pattern $Pattern | ForEach-Object { "{0}:{1}: {2}" -f $_.Path.Split('\')[-1], $_.LineNumber, $_.Line.Trim() }
