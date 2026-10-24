# Says which open-model API keys are set (never prints their values).
foreach ($name in 'OPENROUTER_API_KEY', 'GROQ_API_KEY', 'HF_TOKEN', 'TOGETHER_API_KEY', 'DEEPINFRA_API_KEY', 'FIREWORKS_API_KEY') {
    $v = [Environment]::GetEnvironmentVariable($name, 'User'); if (-not $v) { $v = [Environment]::GetEnvironmentVariable($name, 'Process') }
    Write-Output ("{0}: {1}" -f $name, $(if ($v) { 'set' } else { 'not set' }))
}
foreach ($f in 'C:\xampp\htdocs\missing-blue\.env.local', 'C:\xampp\htdocs\missing-blue\video\.env', 'C:\xampp\htdocs\missing-blue\video\.env.local') {
    if (Test-Path $f) { Write-Output ("{0} has keys: {1}" -f $f, ((Get-Content $f | Where-Object { $_ -match '^\s*[A-Z_]+=' } | ForEach-Object { ($_ -split '=')[0].Trim() }) -join ', ')) }
}
