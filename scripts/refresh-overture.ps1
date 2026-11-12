param([switch]$Manual)
$ErrorActionPreference = 'Stop'
$project = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$dataDir = Join-Path $project 'data'
$statusFile = Join-Path $dataDir 'overture-refresh-status.json'
$latestFile = Join-Path $dataDir 'overture-places-latest.jsonl'
$tempFile = Join-Path $dataDir ('overture-places-' + [guid]::NewGuid().ToString('N') + '.jsonl')

function Write-RefreshStatus([string]$state, [string]$message, [string]$release) {
  $json = @{ state = $state; message = $message; release = $release; filterVersion = 3; checkedAt = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json
  [IO.File]::WriteAllText($statusFile, $json, [Text.UTF8Encoding]::new($false))
}

New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
$mutex = New-Object Threading.Mutex($false, 'Local\RadarClientesOvertureRefresh')
$hasLock = $mutex.WaitOne(0)
if (-not $hasLock) { Write-Host 'Outra atualização Overture já está em andamento.'; $mutex.Dispose(); exit 0 }
$release = ''
try {
  $duckdb = Join-Path $project 'tools\duckdb\duckdb.exe'
  if (-not (Test-Path -LiteralPath $duckdb)) {
    $command = Get-Command duckdb -ErrorAction SilentlyContinue
    if (-not $command) { throw 'DuckDB não encontrado. Instale a CLI e execute novamente.' }
    $duckdb = $command.Source
  }
  $catalog = Invoke-RestMethod -Uri 'https://stac.overturemaps.org/catalog.json' -TimeoutSec 30
  $release = [string]$catalog.latest
  if ($release -notmatch '^\d{4}-\d{2}-\d{2}\.\d+$') { throw 'O catálogo Overture retornou uma versão inesperada.' }
  if (Test-Path -LiteralPath $statusFile) {
    $previous = Get-Content -LiteralPath $statusFile -Raw | ConvertFrom-Json
    if ($previous.state -eq 'ok' -and $previous.release -eq $release -and $previous.filterVersion -eq 3 -and (Test-Path -LiteralPath $latestFile)) {
      Write-RefreshStatus 'ok' 'A fonte foi verificada; a versão publicada ainda não mudou.' $release
      Write-Host "Overture ${release}: sem nova versão publicada."
      exit 0
    }
  }
  $sqlPath = $tempFile.Replace('\', '/').Replace("'", "''")
  $parquet = "s3://overturemaps-us-west-2/release/$release/theme=places/type=place/*"
  $sql = @"
LOAD httpfs;
SET s3_region='us-west-2';
COPY (
  WITH scoped AS (
    SELECT id, names.primary AS name, taxonomy.primary AS category,
           brand.names.primary AS brand_name,
           addresses[1].freeform AS address, addresses[1].locality AS locality,
           addresses[1].region AS region, addresses[1].country AS country,
           bbox.ymin AS latitude, bbox.xmin AS longitude,
           phones[1] AS phone, websites[1] AS website,
           lower(regexp_replace(strip_accents(split_part(trim(names.primary), ' ', 1)), '[^A-Za-z0-9]', '', 'g')) AS first_token,
           lower(strip_accents(split_part(regexp_replace(websites[1], '^https?://', ''), '/', 1))) AS website_domain,
           confidence, operating_status
    FROM read_parquet('$parquet')
    WHERE bbox.xmin BETWEEN -46.90 AND -46.30
      AND bbox.ymin BETWEEN -24.05 AND -23.30
      AND addresses[1].country = 'BR'
      AND names.primary IS NOT NULL
      AND phones IS NOT NULL AND array_length(phones) > 0
  ), marked AS (
    SELECT *,
      MAX(CASE WHEN website IS NOT NULL AND trim(website) <> '' THEN 1 ELSE 0 END)
        OVER (PARTITION BY phone) AS phone_has_site,
      MAX(CASE WHEN website IS NOT NULL AND trim(website) <> '' THEN 1 ELSE 0 END)
        OVER (PARTITION BY lower(trim(name))) AS name_has_site
      ,MAX(CASE WHEN website IS NOT NULL
        AND (length(first_token) >= 5 OR first_token = 'omo')
        AND first_token NOT IN ('clinica','academia','barbearia','padaria','supermercado','supermercados','restaurante','pizzaria','salao','studio','hotel','escola','farmacia','drogaria','mercado','emporio','oficina','hospital','instituto','otica','estetica','espaco','centro','loja','lojas','casa','pet')
        AND contains(website_domain, first_token)
        THEN 1 ELSE 0 END) OVER (PARTITION BY first_token) AS prefix_has_site
    FROM scoped
  )
  SELECT id, name, category, brand_name, address, locality, region, country,
         latitude, longitude, phone, website, confidence, operating_status,
         phone_has_site, name_has_site, prefix_has_site
  FROM marked
  WHERE category IS NOT NULL
    AND (website IS NULL OR trim(website) = '')
    AND confidence >= 0.8
    AND (operating_status IS NULL OR operating_status = 'open')
) TO '$sqlPath' (FORMAT JSON);
"@
  $oldPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $queryOutput = @($sql | & $duckdb -batch -bail 2>&1); $duckdbExit = $LASTEXITCODE }
  finally { $ErrorActionPreference = $oldPreference; $sql = $null }
  if ($duckdbExit -ne 0 -or -not (Test-Path -LiteralPath $tempFile)) {
    $details = ($queryOutput | Out-String).Trim()
    if ($details.Length -gt 500) { $details = $details.Substring(0, 500) }
    throw "A consulta pública à Overture falhou. $details"
  }
  Push-Location $project
  try { & node (Join-Path $PSScriptRoot 'import-overture.mjs') $tempFile $release; $importExit = $LASTEXITCODE }
  finally { Pop-Location }
  if ($importExit -ne 0) { throw 'A importação da Overture falhou; a base anterior foi preservada.' }
  Move-Item -LiteralPath $tempFile -Destination $latestFile -Force
  Write-RefreshStatus 'ok' 'Empresas com telefone e sem website informado carregadas da Overture Maps.' $release
  Write-Host "Overture ${release}: atualização concluída."
} catch {
  Write-RefreshStatus 'error' $_.Exception.Message $release
  Write-Error $_.Exception.Message
  exit 1
} finally {
  if (Test-Path -LiteralPath $tempFile) { Remove-Item -LiteralPath $tempFile -Force }
  if ($hasLock) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
