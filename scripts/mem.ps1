# Shows free memory and the processes using the most RAM.
$os = Get-CimInstance Win32_OperatingSystem
Write-Output ("free RAM: {0:N1} GB of {1:N1} GB; free virtual: {2:N1} GB" -f ($os.FreePhysicalMemory / 1MB), ($os.TotalVisibleMemorySize / 1MB), ($os.FreeVirtualMemory / 1MB))
Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 15 Id, ProcessName, @{n = 'RAM_MB'; e = { [int]($_.WorkingSet64 / 1MB) } }, @{n = 'Commit_MB'; e = { [int]($_.PagedMemorySize64 / 1MB) } }, StartTime | Format-Table -AutoSize
Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" | Select-Object ProcessId, @{n = 'MB'; e = { [int]($_.WorkingSetSize / 1MB) } }, CommandLine | Format-List
