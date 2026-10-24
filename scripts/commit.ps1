# Stages the project and makes the first commit (helper scripts used only while building are left out).
Set-Location (Split-Path $PSScriptRoot -Parent)
Remove-Item -ErrorAction SilentlyContinue .\scripts\agent-progress.ps1, .\scripts\dl-progress.ps1
git add -A
git -c user.name="Blue Balance team" -c user.email="abdalrahman.alhaymouni@gmail.com" commit -q -m "Blue Balance: water complaints as a sensor, open models on one laptop" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline -1
git status --short
