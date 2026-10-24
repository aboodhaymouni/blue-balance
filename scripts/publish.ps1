# Builds the static demo, creates the public GitHub repo, pushes main, and publishes web/dist to GitHub Pages.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$root = Get-Location

$env:VITE_STATIC = '1'
npm --prefix web run build
Remove-Item Env:\VITE_STATIC

git add -A
git -c user.name="Blue Balance team" -c user.email="abdalrahman.alhaymouni@gmail.com" commit -q -m "Static demo for GitHub Pages: replays results recorded from the local models" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"

$exists = $true
try { gh repo view aboodhaymouni/blue-balance --json name | Out-Null } catch { $exists = $false }
if (-not $exists) {
    gh repo create aboodhaymouni/blue-balance --public --source . --remote origin --description "Blue Balance: every 'no water' complaint is a sensor. Open-weight models on one laptop. Hacktoberfest Hack Day Amman 2026."
}
git push -u origin main

# Publish web/dist on the gh-pages branch from a throwaway repo inside dist.
Set-Location web\dist
New-Item -ItemType File -Name .nojekyll -Force | Out-Null
if (Test-Path .git) { Remove-Item -Recurse -Force .git }
git init -q -b gh-pages
git add -A
git -c user.name="Blue Balance team" -c user.email="abdalrahman.alhaymouni@gmail.com" commit -q -m "Static demo build"
git push -f https://github.com/aboodhaymouni/blue-balance.git gh-pages
Remove-Item -Recurse -Force .git
Set-Location $root

try { gh api -X POST repos/aboodhaymouni/blue-balance/pages -f "source[branch]=gh-pages" -f "source[path]=/" | Out-Null } catch { Write-Output "Pages already enabled or will enable shortly: $($_.Exception.Message)" }
Write-Output "Repo: https://github.com/aboodhaymouni/blue-balance"
Write-Output "Demo: https://aboodhaymouni.github.io/blue-balance/"
