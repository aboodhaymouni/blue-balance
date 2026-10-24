# Finds OPENROUTER_API_KEY in the claude-whats project's env files and copies it into this project's
# .env.local (git-ignored). Prints only where it was found and its length, never the value.
$root = Split-Path $PSScriptRoot -Parent
$files = Get-ChildItem -Path 'C:\xampp\htdocs\claude-whats' -Recurse -Depth 3 -Force -File -Filter '*.env*' -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\node_modules\\|\\vendor\\|\\\.git\\' }
foreach ($f in $files) {
    $line = Select-String -Path $f.FullName -Pattern '^\s*OPENROUTER_API_KEY\s*=\s*(.+)$' | Select-Object -First 1
    if ($line) {
        $key = $line.Matches[0].Groups[1].Value.Trim().Trim('"').Trim("'")
        if ($key.Length -gt 20) {
            Set-Content -Path (Join-Path $root '.env.local') -Value "OPENROUTER_API_KEY=$key" -Encoding ascii
            Write-Output ("found in {0} (length {1}); written to .env.local" -f $f.FullName, $key.Length)
            exit 0
        }
    }
}
Write-Output 'no OPENROUTER_API_KEY found'
