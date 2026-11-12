param([switch]$Manual)
$ErrorActionPreference = 'Stop'
$project = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$dataDir = Join-Path $project 'data'
$statusFile = Join-Path $dataDir 'refresh-status.json'
$tokenFile = Join-Path $dataDir 'fsq-token.dpapi'
$configFile = Join-Path $dataDir 'refresh-config.json'
$tempFile = Join-Path $dataDir ("sp-places-" + [guid]::NewGuid().ToString('N') + '.jsonl')

function Write-RefreshStatus([string]$state, [string]$message) {
  $json = @{ state = $state; message = $message; checkedAt = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json
  [IO.File]::WriteAllText($statusFile, $json, [Text.UTF8Encoding]::new($false))
}

$mutex = New-Object Threading.Mutex($false, 'Local\RadarClientesFoursquareRefresh')
$hasLock = $mutex.WaitOne(0)
if (-not $hasLock) { Write-Host 'Outra atualização já está em andamento.'; $mutex.Dispose(); exit 0 }
try {
  if (-not (Test-Path -LiteralPath $tokenFile) -or -not (Test-Path -LiteralPath $configFile)) {
    throw 'Execute scripts/setup-daily.ps1 para cadastrar o token local e o DuckDB.'
  }
  $config = Get-Content -LiteralPath $configFile -Raw | ConvertFrom-Json
  $duckdb = [string]$config.duckdb
  if (-not (Test-Path -LiteralPath $duckdb)) { throw 'DuckDB não encontrado no caminho configurado.' }
  $secureToken = ConvertTo-SecureString ((Get-Content -LiteralPath $tokenFile -Raw).Trim())
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  if ([string]::IsNullOrWhiteSpace($token)) { throw 'Token Foursquare vazio.' }
  $escapedToken = $token.Replace("'", "''")
  $sqlPath = $tempFile.Replace('\', '/').Replace("'", "''")
  $sql = @"
INSTALL httpfs;
LOAD httpfs;
CREATE SECRET fsq_refresh_secret (TYPE ICEBERG, TOKEN '$escapedToken');
ATTACH 'places' AS places (
  TYPE iceberg,
  SECRET fsq_refresh_secret,
  ENDPOINT 'https://catalog.h3-hub.foursquare.com/iceberg'
);
COPY (
  SELECT fsq_place_id, name, address, locality, region, country,
         latitude, longitude, website, tel, date_closed, date_refreshed,
         fsq_category_labels, unresolved_flags
  FROM places.datasets.places_os
  WHERE country = 'BR'
    AND latitude BETWEEN -24.05 AND -23.30
    AND longitude BETWEEN -46.90 AND -46.30
    AND (website IS NULL OR trim(website) = '')
    AND tel IS NOT NULL AND trim(tel) <> ''
    AND date_closed IS NULL
) TO '$sqlPath' (FORMAT JSON);
"@
  $oldPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $queryOutput = @($sql | & $duckdb -batch -bail 2>&1); $duckdbExit = $LASTEXITCODE }
  finally { $ErrorActionPreference = $oldPreference; $sql = $null }
  if ($duckdbExit -ne 0 -or -not (Test-Path -LiteralPath $tempFile)) {
    $details = ($queryOutput | Out-String).Trim().Replace($token, '[TOKEN]').Replace($escapedToken, '[TOKEN]')
    $details = $details -replace 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[TOKEN]'
    if ($details -match '401|Unauthorized') { throw 'O token salvo foi recusado pelo catálogo (HTTP 401). Execute setup-daily.ps1 com um token válido de acesso ao dataset OS Places.' }
    if ($details -match '429|Too Many Requests') { throw 'O catálogo limitou as consultas (HTTP 429). A base anterior foi mantida; tente atualizar mais tarde.' }
    if ($details.Length -gt 600) { $details = $details.Substring(0, 600) }
    throw "A consulta ao catálogo Foursquare falhou. $details"
  }
  $token = $null
  $escapedToken = $null
  Push-Location $project
  try { & node (Join-Path $PSScriptRoot 'import-fsq.mjs') $tempFile --replace; $importExit = $LASTEXITCODE }
  finally { Pop-Location }
  if ($importExit -ne 0) { throw 'A exportação não continha locais válidos ou a importação falhou.' }
  Move-Item -LiteralPath $tempFile -Destination (Join-Path $dataDir 'sp-places-latest.jsonl') -Force
  Write-RefreshStatus 'ok' 'Base atualizada com locais confirmados no município de São Paulo e telefone informado na Foursquare.'
  Write-Host 'Atualização da Foursquare concluída.'
} catch {
  Write-RefreshStatus 'error' $_.Exception.Message
  Write-Error $_.Exception.Message
  exit 1
} finally {
  if (Test-Path -LiteralPath $tempFile) { Remove-Item -LiteralPath $tempFile -Force }
  if ($hasLock) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
