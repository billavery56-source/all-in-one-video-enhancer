param(
  [string]$OutputRoot = "webstore"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root "manifest.firefox.json"
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$version = $manifest.version

if (-not ($version -match '^\d+\.\d+\.\d+(\.\d+)?$')) {
  throw "Manifest version '$version' is not a valid extension version."
}

$packageName = "all-in-one-video-enhancer-firefox-v$version.zip"
$outputDir = if ([System.IO.Path]::IsPathRooted($OutputRoot)) {
  $OutputRoot
} else {
  Join-Path $root $OutputRoot
}
$outputPath = Join-Path $outputDir $packageName
$stageDir = Join-Path $env:TEMP "aive-firefox-$version"

Remove-Item -LiteralPath $stageDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $stageDir | Out-Null
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$items = @(
  "sw.js",
  "README.md",
  "privacy-policy.md",
  "package.json",
  "icons",
  "scripts",
  "styles"
)

foreach ($item in $items) {
  $source = Join-Path $root $item
  if (-not (Test-Path -LiteralPath $source)) {
    throw "Missing package item: $item"
  }

  $destination = Join-Path $stageDir $item
  Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
}

Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $stageDir "manifest.json") -Force

$oldLocation = Get-Location
try {
  Set-Location -LiteralPath $stageDir
  $archiveItems = @("manifest.json") + $items
  Compress-Archive -Path $archiveItems -DestinationPath $outputPath -Force
} finally {
  Set-Location $oldLocation
  Remove-Item -LiteralPath $stageDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Created $outputPath"
