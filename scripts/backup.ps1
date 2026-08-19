# Document Hub backup (Windows/PowerShell wrapper) — see scripts/backup.sh
# for the canonical Linux version and docs/backup-restore.md for the full
# procedure. Dumps PostgreSQL and document storage together; neither alone
# is sufficient to restore a working instance.
#
# Usage: .\scripts\backup.ps1 [-BackupRoot .\backups]
param(
    [string]$BackupRoot = ".\backups"
)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$Timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$BackupDir = Join-Path $BackupRoot $Timestamp
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

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
$StorageDriver = if ($EnvVars.ContainsKey("STORAGE_DRIVER")) { $EnvVars["STORAGE_DRIVER"] } else { "local" }

Write-Host "==> Backing up PostgreSQL database '$PostgresDb'..."
$DbDumpPath = Join-Path $BackupDir "database.dump"
# Direct redirect (not a Set-Content pipeline) so the binary pg_dump output
# is written byte-for-byte, not mangled by PowerShell's text pipeline.
docker compose exec -T postgres pg_dump -U $PostgresUser -d $PostgresDb --format=custom > $DbDumpPath

$StorageTarPath = $null
if ($StorageDriver -eq "local") {
    Write-Host "==> Backing up document storage..."
    $StorageTarPath = Join-Path $BackupDir "storage.tar.gz"
    docker compose exec -T api tar czf - -C /app/storage . > $StorageTarPath
} else {
    Write-Host "==> STORAGE_DRIVER=s3 — back up document files via your S3-compatible provider's own tooling (see docs/backup-restore.md)."
    "STORAGE_DRIVER=s3 at backup time; files are not on this host." | Set-Content (Join-Path $BackupDir "storage.SKIPPED.txt")
}

$AppVersion = "unknown"
try {
    $AppVersion = (Get-Content (Join-Path $PSScriptRoot "..\apps\api\package.json") -Raw | ConvertFrom-Json).version
} catch {}

function Get-FileSha256($path) {
    if (-not $path -or -not (Test-Path $path)) { return "n/a" }
    return (Get-FileHash -Path $path -Algorithm SHA256).Hash.ToLower()
}

$Manifest = @{
    timestamp = $Timestamp
    appVersion = $AppVersion
    postgresDatabase = $PostgresDb
    storageDriver = $StorageDriver
    files = @{
        database = @{ name = "database.dump"; sha256 = (Get-FileSha256 $DbDumpPath) }
        storage = @{ name = "storage.tar.gz"; sha256 = (Get-FileSha256 $StorageTarPath) }
    }
}
$Manifest | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $BackupDir "manifest.json")

Write-Host "==> Backup complete: $BackupDir"
Get-ChildItem $BackupDir | Format-Table Name, Length
