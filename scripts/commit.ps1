# Stages the project and commits it with the message given as the first argument.
param([string]$Message = "Update Blue Balance")
Set-Location (Split-Path $PSScriptRoot -Parent)
git add -A
git -c user.name="Blue Balance team" -c user.email="abdalrahman.alhaymouni@gmail.com" commit -q -m $Message -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git log --oneline -3
git status --short
gh auth status
