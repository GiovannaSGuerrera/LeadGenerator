$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'refresh-overture.ps1'
$powershell = (Get-Command powershell.exe).Source
$action = New-ScheduledTaskAction -Execute $powershell -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$script`""
$trigger = New-ScheduledTaskTrigger -Daily -At '07:00'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 3)
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'RadarClientes-Overture-Diario' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Verifica diariamente a versão Overture e atualiza empresas de São Paulo às 07:00.' -Force | Out-Null
Write-Host 'Verificação diária Overture registrada para 07:00, horário local.'
