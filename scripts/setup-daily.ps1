$ErrorActionPreference = 'Stop'
$project = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$dataDir = Join-Path $project 'data'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

$bundledDuckdb = Join-Path $project 'tools\duckdb\duckdb.exe'
$command = Get-Command duckdb -ErrorAction SilentlyContinue
$duckdb = if (Test-Path -LiteralPath $bundledDuckdb) { $bundledDuckdb } elseif ($command) { $command.Source } else { Read-Host 'Caminho completo do duckdb.exe' }
$duckdb = $duckdb.Trim('"')
if (-not (Test-Path -LiteralPath $duckdb)) { throw 'DuckDB não encontrado. Abra um novo PowerShell e informe o caminho completo do duckdb.exe.' }

$token = Read-Host 'Cole o token NOVO do Foursquare Places Portal (não aparecerá na tela)' -AsSecureString
if ($token.Length -eq 0) { throw 'Token vazio. Nenhuma tarefa foi agendada.' }
Write-Host 'Verificando acesso ao catálogo antes de salvar o token...'
& (Join-Path $PSScriptRoot 'test-fsq-token.ps1') -Token $token -DuckDb $duckdb
$token | ConvertFrom-SecureString | Set-Content -LiteralPath (Join-Path $dataDir 'fsq-token.dpapi') -Encoding UTF8
@{ duckdb = $duckdb } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $dataDir 'refresh-config.json') -Encoding UTF8

& (Join-Path $PSScriptRoot 'register-daily.ps1')
Write-Host 'Iniciando a primeira atualização agora...'
& (Join-Path $PSScriptRoot 'refresh-fsq.ps1') -Manual
