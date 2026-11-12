param(
  [Parameter(Mandatory = $true)][Security.SecureString]$Token,
  [Parameter(Mandatory = $true)][string]$DuckDb
)
$ErrorActionPreference = 'Stop'
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Token)
try { $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
$escapedToken = $plainToken.Replace("'", "''")
$sql = @"
INSTALL httpfs;
LOAD httpfs;
CREATE SECRET fsq_check_secret (TYPE ICEBERG, TOKEN '$escapedToken');
ATTACH 'places' AS places (
  TYPE iceberg,
  SECRET fsq_check_secret,
  ENDPOINT 'https://catalog.h3-hub.foursquare.com/iceberg'
);
SELECT fsq_place_id FROM places.datasets.places_os LIMIT 1;
"@
$oldPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try { $result = @($sql | & $DuckDb -batch -bail 2>&1); $code = $LASTEXITCODE }
finally { $ErrorActionPreference = $oldPreference; $sql = $null; $plainToken = $null; $escapedToken = $null }
if ($code -ne 0) {
  $diagnostic = $result | Out-String
  if ($diagnostic -match '401|Unauthorized') { throw 'O catálogo recusou este token (HTTP 401). Copie o token de acesso ao dataset OS Places, não o identificador do token ou uma chave da Places API.' }
  if ($diagnostic -match '429|Too Many Requests') { throw 'O catálogo limitou as consultas (HTTP 429). Aguarde e tente novamente.' }
  throw 'Não foi possível validar o token no catálogo Foursquare. Confira a conexão e o acesso ao dataset OS Places.'
}
Write-Host 'Token validado no catálogo FSQ OS Places.'
