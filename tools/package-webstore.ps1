param(
  [string]$OutputRoot = "webstore"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root "manifest.json"
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
$version = $manifest.version

if (-not ($version -match '^\d+\.\d+\.\d+(\.\d+)?$')) {
  throw "Manifest version '$version' is not a valid Chrome extension version."
}

$packageName = "all-in-one-video-enhancer-v$version.zip"
$outputDir = if ([System.IO.Path]::IsPathRooted($OutputRoot)) {
  $OutputRoot
} else {
  Join-Path $root $OutputRoot
}
$outputPath = Join-Path $outputDir $packageName
$stageDir = Join-Path $env:TEMP "aive-webstore-$version"

Remove-Item -LiteralPath $stageDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $stageDir | Out-Null
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$items = @(
  "manifest.json",
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

$oldLocation = Get-Location
try {
  Set-Location -LiteralPath $stageDir
  Compress-Archive -Path $items -DestinationPath $outputPath -Force
} finally {
  Set-Location $oldLocation
  Remove-Item -LiteralPath $stageDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Created $outputPath"
