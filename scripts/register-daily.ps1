$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'refresh-fsq.ps1'
$powershell = (Get-Command powershell.exe).Source
$action = New-ScheduledTaskAction -Execute $powershell -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$script`""
$trigger = New-ScheduledTaskTrigger -Daily -At '07:00'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 3)
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'RadarClientes-Foursquare-Diario' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Atualiza diariamente os locais Foursquare de São Paulo às 07:00.' -Force | Out-Null
Write-Host 'Tarefa diária criada para 07:00, horário local. Ela roda quando esta conta estiver conectada ao Windows.'
