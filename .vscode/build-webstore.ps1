<# 
build-webstore.ps1
Creates a store-ready ZIP for a Chrome/Edge extension:
- Ensures manifest.json is at the ZIP root
- Excludes common dev junk: .vscode, .git, node_modules, etc.
- Outputs to: <project>\_webstore\<name>-<version>.zip

Usage:
  powershell -ExecutionPolicy Bypass -File .\build-webstore.ps1
  powershell -ExecutionPolicy Bypass -File .\build-webstore.ps1 -Clean
  powershell -ExecutionPolicy Bypass -File .\build-webstore.ps1 -DryRun
  powershell -ExecutionPolicy Bypass -File .\build-webstore.ps1 -NoZip   (keeps staged folder only)
#>

[CmdletBinding()]
param(
  [string]$ProjectRoot = (Get-Location).Path,
  [string]$OutDir = (Join-Path (Get-Location).Path "_webstore"),
  [switch]$Clean,
  [switch]$NoZip,
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Fail($msg) {
  Write-Host ""
  Write-Host "ERROR: $msg" -ForegroundColor Red
  exit 1
}

function Slugify([string]$s) {
  if ([string]::IsNullOrWhiteSpace($s)) { return "extension" }
  $s = $s.ToLowerInvariant()
  $s = $s -replace "[^a-z0-9]+", "-"
  $s = $s.Trim("-")
  if ($s.Length -lt 1) { return "extension" }
  return $s
}

function IsUnderPath([string]$fullPath, [string]$basePath) {
  $full = [IO.Path]::GetFullPath($fullPath)
  $base = [IO.Path]::GetFullPath($basePath)
  if (!$base.EndsWith([IO.Path]::DirectorySeparatorChar)) {
    $base += [IO.Path]::DirectorySeparatorChar
  }
  return $full.StartsWith($base, [System.StringComparison]::OrdinalIgnoreCase)
}

# Folders/files we never want in a store package
$ExcludedDirNames = @(
  ".git", ".github", ".vscode", ".idea",
  "node_modules",
  "_webstore", "dist", "build", "out", ".output",
  "test", "tests", "__tests__", "coverage",
  "docs", "doc", "notes",
  ".husky"
)

# File patterns to exclude anywhere
$ExcludedFilePatterns = @(
  "*.ps1", "*.psm1",
  "*.zip", "*.7z", "*.rar",
  "*.log",
  "*.map",
  "*.ts", "*.tsx",         # if you ship TypeScript compiled output only
  "*.scss", "*.sass",      # if you ship compiled css only
  "*.psd", "*.ai", "*.sketch", "*.fig", "*.xcf", "*.blend"
)

$ManifestPath = Join-Path $ProjectRoot "manifest.json"
if (!(Test-Path $ManifestPath)) {
  Fail "manifest.json not found in project root: $ProjectRoot"
}

# Read manifest for naming/version
$manifestJson = Get-Content -Raw -Path $ManifestPath | ConvertFrom-Json
$extName = $manifestJson.name
$extVersion = $manifestJson.version

if ([string]::IsNullOrWhiteSpace($extVersion)) { Fail "manifest.json is missing a version." }
$slug = Slugify($extName)
$zipName = "$slug-$extVersion.zip"

$StageDir = Join-Path $OutDir "_stage"
$ZipPath  = Join-Path $OutDir $zipName

if ($Clean -and (Test-Path $OutDir)) {
  Write-Host "Cleaning output folder: $OutDir"
  Remove-Item -Recurse -Force $OutDir
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
if (Test-Path $StageDir) { Remove-Item -Recurse -Force $StageDir }
New-Item -ItemType Directory -Force -Path $StageDir | Out-Null

Write-Host "Project: $ProjectRoot"
Write-Host "Output : $ZipPath"
Write-Host "Stage  : $StageDir"
Write-Host ""

function ShouldExclude([string]$fullPath) {
  # Exclude anything inside known excluded dirs
  foreach ($d in $ExcludedDirNames) {
    $candidate = Join-Path $ProjectRoot $d
    if (Test-Path $candidate) {
      if (IsUnderPath $fullPath $candidate) { return $true }
    }
  }

  # Exclude output dir itself if it's inside ProjectRoot
  if (Test-Path $OutDir) {
    if (IsUnderPath $fullPath $OutDir) { return $true }
  }

  # Exclude file patterns
  $name = [IO.Path]::GetFileName($fullPath)
  foreach ($p in $ExcludedFilePatterns) {
    if ($name -like $p) { return $true }
  }

  return $false
}

# Copy everything except excludes, preserving structure
$allItems = Get-ChildItem -LiteralPath $ProjectRoot -Force -Recurse -File

[int]$copied = 0
[int]$skipped = 0
[long]$bytes = 0

foreach ($f in $allItems) {
  $full = $f.FullName

  if (ShouldExclude $full) {
    $skipped++
    continue
  }

  # Relative path
  $rel = $full.Substring([IO.Path]::GetFullPath($ProjectRoot).Length).TrimStart("\","/")
  $dest = Join-Path $StageDir $rel
  $destDir = Split-Path -Parent $dest

  if ($DryRun) {
    Write-Host "[DRY] copy $rel"
    $copied++
    $bytes += $f.Length
    continue
  }

  New-Item -ItemType Directory -Force -Path $destDir | Out-Null
  Copy-Item -LiteralPath $full -Destination $dest -Force
  $copied++
  $bytes += $f.Length
}

# Ensure manifest is at stage root (it should be, but enforce it)
$stagedManifest = Join-Path $StageDir "manifest.json"
if (!(Test-Path $stagedManifest)) {
  Fail "Staging failed: manifest.json did not end up at ZIP root. Check excludes."
}

Write-Host ""
Write-Host ("Copied : {0} files" -f $copied)
Write-Host ("Skipped: {0} files (excluded)" -f $skipped)
Write-Host ("Size   : {0:N2} MB staged" -f ($bytes / 1MB))

if ($NoZip) {
  Write-Host ""
  Write-Host "NoZip set — staged folder is ready at:" -ForegroundColor Yellow
  Write-Host "  $StageDir"
  exit 0
}

if ($DryRun) {
  Write-Host ""
  Write-Host "DryRun set — not creating ZIP." -ForegroundColor Yellow
  exit 0
}

# IMPORTANT: Zip the CONTENTS of the stage folder so manifest.json is at ZIP root
if (Test-Path $ZipPath) { Remove-Item -Force $ZipPath }
Compress-Archive -Path (Join-Path $StageDir "*") -DestinationPath $ZipPath -Force

Write-Host ""
Write-Host "DONE ✅ Store ZIP created:" -ForegroundColor Green
Write-Host "  $ZipPath"
