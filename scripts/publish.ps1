# Builds the static demo and publishes web/dist to the gh-pages branch of aboodhaymouni/blue-balance.
# The repo itself is created once with: gh repo create aboodhaymouni/blue-balance --public --source . --remote origin --push
Set-Location (Split-Path $PSScriptRoot -Parent)
$root = Get-Location

$env:VITE_STATIC = '1'
npm --prefix web run build
Remove-Item Env:\VITE_STATIC
if ($LASTEXITCODE -ne 0) { throw "build failed" }

Set-Location web\dist
New-Item -ItemType File -Name .nojekyll -Force | Out-Null
if (Test-Path .git) { Remove-Item -Recurse -Force .git }
git init -q -b gh-pages
git add -A
git -c user.name="Blue Balance team" -c user.email="abdalrahman.alhaymouni@gmail.com" commit -q -m "Static demo build"
git push -f https://github.com/aboodhaymouni/blue-balance.git gh-pages
Remove-Item -Recurse -Force .git
Set-Location $root

gh api -X POST repos/aboodhaymouni/blue-balance/pages -f "source[branch]=gh-pages" -f "source[path]=/"
Write-Output "Repo: https://github.com/aboodhaymouni/blue-balance"
Write-Output "Demo: https://aboodhaymouni.github.io/blue-balance/"
