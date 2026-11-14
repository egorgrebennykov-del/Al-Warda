# import_nhost_data.ps1 — run al_warda_import.sql against Nhost Postgres.
# PREPARED, not yet executed (needs NHOST_DATABASE_URL).
#
# Usage:
#   $env:NHOST_DATABASE_URL = '<nhost postgres connection string>'
#   pwsh -File docs/migration/supabase-to-nhost/tools/import_nhost_data.ps1
#
# SECURITY: the connection string is a secret — read from env only, never logged.

$ErrorActionPreference = "Stop"

$dbUrl = $env:NHOST_DATABASE_URL
if (-not $dbUrl) { Write-Error "NHOST_DATABASE_URL not set (secret, keep out of logs)"; exit 1 }

$psql = (Get-Command psql -ErrorAction SilentlyContinue).Source
if (-not $psql) { Write-Error "psql not found"; exit 1 }

$sqlFile = Join-Path $PSScriptRoot "..\..\..\al_warda_import.sql"
$sqlFile = [System.IO.Path]::GetFullPath($sqlFile)
if (-not (Test-Path $sqlFile)) { Write-Error "missing $sqlFile"; exit 1 }

# Expected row counts (from SCHEMA_DIFF.md) — used only for verification.
$expected = @{
  '"user"'               = 2
  coupons                = 1
  stocks                 = 5063
  announcements          = 1
  cart                   = 1
  inquiries              = 1
  orders_in_progress     = 2
}

function Count-Rows($table) {
  $q = "select count(*) from public.$table;"
  $out = & $psql $dbUrl -t -A -c $q 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }
  return [int]($out | Select-Object -First 1)
}

Write-Host "[import] checking target table contents (not assuming empty)…"
foreach ($t in $expected.Keys) {
  $n = Count-Rows $t
  Write-Host ("  {0,-20} existing rows: {1}" -f $t, $(if ($null -eq $n) {'<missing table>' } else { $n }))
}

Write-Host "[import] running $sqlFile …"
& $psql $dbUrl -v ON_ERROR_STOP=1 -f $sqlFile
if ($LASTEXITCODE -ne 0) { Write-Error "import failed (psql exit $LASTEXITCODE)"; exit 1 }

Write-Host "[import] verifying row counts…"
$fail = $false
foreach ($t in $expected.Keys) {
  $n = Count-Rows $t
  $exp = $expected[$t]
  $ok = ($null -ne $n) -and ($n -ge $exp)
  Write-Host ("  {0,-20} after: {1}  (expected >= {2})  {3}" -f $t, $n, $exp, $(if ($ok) {'OK'} else {'MISMATCH'}))
  if (-not $ok) { $fail = $true }
}
if ($fail) { Write-Error "row-count verification failed"; exit 1 }
Write-Host "[import] DONE"
