# Free space per drive, and the size of caches that are safe to clear (they are re-downloaded when needed).
Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{n = 'FreeGB'; e = { [math]::Round($_.Free / 1GB, 2) } }, @{n = 'UsedGB'; e = { [math]::Round($_.Used / 1GB, 1) } } | Format-Table -AutoSize
$candidates = @(
    "$env:USERPROFILE\npm-cache",
    "$env:LOCALAPPDATA\npm-cache",
    "$env:LOCALAPPDATA\pip\cache",
    "$env:TEMP",
    "$env:USERPROFILE\.cache\huggingface\hub",
    "$env:USERPROFILE\.cache\huggingface\hub\models--mobiuslabsgmbh--faster-whisper-large-v3-turbo"
)
foreach ($p in $candidates) {
    if (Test-Path $p) {
        $size = (Get-ChildItem -LiteralPath $p -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
        Write-Output ("{0,8:N2} GB  {1}" -f ($size / 1GB), $p)
    }
}
