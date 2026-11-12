$ErrorActionPreference = 'Stop'
$project = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$script = Join-Path $PSScriptRoot 'import-public-requests.mjs'
$node = (Get-Command node.exe).Source
$action = New-ScheduledTaskAction -Execute $node -Argument "`"$script`"" -WorkingDirectory $project
$trigger = New-ScheduledTaskTrigger -Daily -At '07:15'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'RadarClientes-PedidosPublicos-Diario' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Atualiza diariamente os pedidos públicos de site e software do PNCP em São Paulo.' -Force | Out-Null
Write-Host 'Atualização de pedidos públicos agendada para 07:15, horário local.'
