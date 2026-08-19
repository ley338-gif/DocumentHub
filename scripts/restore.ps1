# Document Hub restore (Windows/PowerShell wrapper) — see scripts/restore.sh
# for the canonical Linux version and docs/backup-restore.md for the full
# procedure.
#
# Usage: .\scripts\restore.ps1 -BackupDir .\backups\20260101T120000Z
param(
    [Parameter(Mandatory = $true)]
    [string]$BackupDir
)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$ManifestPath = Join-Path $BackupDir "manifest.json"
if (-not (Test-Path $ManifestPath)) {
    Write-Error "ERROR: $BackupDir does not look like a backup (no manifest.json)"
    exit 1
}
$Manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json

$EnvVars = @{}
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
        $key, $value = $_ -split '=', 2
        $EnvVars[$key.Trim()] = $value.Trim()
    }
}
$PostgresUser = if ($EnvVars.ContainsKey("POSTGRES_USER")) { $EnvVars["POSTGRES_USER"] } else { "document_hub" }
$PostgresDb = if ($EnvVars.ContainsKey("POSTGRES_DB")) { $EnvVars["POSTGRES_DB"] } else { "document_hub" }

Write-Host "==> Verifying backup file integrity against manifest..."
foreach ($key in @("database", "storage")) {
    $entry = $Manifest.files.$key
    if ($entry.sha256 -eq "n/a") { continue }
    $path = Join-Path $BackupDir $entry.name
    $actual = (Get-FileHash -Path $path -Algorithm SHA256).Hash.ToLower()
    if ($actual -ne $entry.sha256) {
        Write-Error "SHA-256 mismatch for $($entry.name): expected $($entry.sha256), got $actual"
        exit 1
    }
    Write-Host "  OK  $($entry.name)"
}

Write-Host "==> Restoring PostgreSQL database '$PostgresDb'..."
$DbDumpPath = Join-Path $BackupDir "database.dump"
Get-Content -Raw -Encoding Byte -Path $DbDumpPath | docker compose exec -T postgres pg_restore -U $PostgresUser -d $PostgresDb --clean --if-exists -1

$StorageTarPath = Join-Path $BackupDir "storage.tar.gz"
if (Test-Path $StorageTarPath) {
    Write-Host "==> Restoring document storage..."
    Get-Content -Raw -Encoding Byte -Path $StorageTarPath | docker compose exec -T api sh -c "rm -rf /app/storage/* /app/storage/.[!.]* 2>/dev/null; tar xzf - -C /app/storage"
} else {
    Write-Host "==> No storage.tar.gz in this backup (STORAGE_DRIVER=s3 at backup time — restore that provider's data separately)."
}

Write-Host "==> Restarting api to pick up restored storage cleanly..."
docker compose restart api

Write-Host "==> Restore complete. Verify with: node scripts/smoke-test.js verify <state-file>"
