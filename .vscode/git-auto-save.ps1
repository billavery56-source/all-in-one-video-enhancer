# .vscode/git-auto-save.ps1
# AIVE Git Auto Save - robust commit+push
# - Detects changes (including untracked)
# - Stages all
# - Commits when needed
# - Pushes when possible
# - Gives clear errors when push/commit can't proceed

$ErrorActionPreference = "Stop"

function Write-Info($msg)  { Write-Host $msg -ForegroundColor Cyan }
function Write-Warn($msg)  { Write-Host $msg -ForegroundColor Yellow }
function Write-Err($msg)   { Write-Host $msg -ForegroundColor Red }
function Write-Ok($msg)    { Write-Host $msg -ForegroundColor Green }

try {
  Write-Info "AIVE git auto-save running..."

  # Ensure git exists
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git is not installed or not on PATH."
  }

  # Ensure we are inside a git repo
  $repoRoot = (git rev-parse --show-toplevel 2>$null)
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repoRoot)) {
    throw "Not inside a git repository (can't find repo root)."
  }

  # Make sure we're operating from the repo root
  Set-Location $repoRoot

  $branch = (git rev-parse --abbrev-ref HEAD 2>$null).Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($branch)) {
    throw "Couldn't determine current branch."
  }

  # Check for ANY changes (including untracked)
  $preStatus = (git status --porcelain -uall 2>$null)
  if ($LASTEXITCODE -ne 0) {
    throw "git status failed."
  }

  if ([string]::IsNullOrWhiteSpace($preStatus)) {
    Write-Warn "No changes to commit."
    exit 0
  }

  # Stage everything (tracked + untracked)
  git add -A | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "git add failed."
  }

  # Double-check after staging
  $postStatus = (git status --porcelain -uall 2>$null)
  if ($LASTEXITCODE -ne 0) {
    throw "git status failed after staging."
  }

  if ([string]::IsNullOrWhiteSpace($postStatus)) {
    Write-Warn "Nothing to commit after staging."
    exit 0
  }

  # Commit
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $commitMsg = "Auto save $timestamp"

  $commitOut = (git commit -m $commitMsg 2>&1)
  $commitCode = $LASTEXITCODE

  if ($commitCode -ne 0) {
    # Treat "nothing to commit" as non-error (git sometimes returns 1)
    if ($commitOut -match "nothing to commit" -or $commitOut -match "no changes added to commit") {
      Write-Warn "Nothing to commit."
      exit 0
    }

    # Helpful hint for common identity setup issue
    if ($commitOut -match "user\.name" -or $commitOut -match "user\.email") {
      Write-Err "Commit failed because git user identity isn't set."
      Write-Info "Fix with:"
      Write-Host '  git config --global user.name  "Your Name"' -ForegroundColor Gray
      Write-Host '  git config --global user.email "you@example.com"' -ForegroundColor Gray
    }

    Write-Err "Commit failed:"
    Write-Host $commitOut
    exit 1
  }

  Write-Ok "Committed: $commitMsg"

  # Push
  # Determine if upstream is set
  $upstream = (git rev-parse --abbrev-ref --symbolic-full-name "@{u}" 2>$null)
  $hasUpstream = ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($upstream))

  if (-not $hasUpstream) {
    Write-Warn "No upstream set for '$branch'. Setting upstream to origin/$branch..."
    $pushOut = (git push -u origin HEAD 2>&1)
    $pushCode = $LASTEXITCODE
  } else {
    $pushOut = (git push 2>&1)
    $pushCode = $LASTEXITCODE
  }

  if ($pushCode -ne 0) {
    Write-Err "Push failed:"
    Write-Host $pushOut

    # Common non-fast-forward guidance
    if ($pushOut -match "non-fast-forward" -or $pushOut -match "fetch first" -or $pushOut -match "rejected") {
      Write-Warn "Remote has new commits. Run this, then retry:"
      Write-Host "  git pull --rebase" -ForegroundColor Gray
      Write-Host "  git push" -ForegroundColor Gray
    }

    exit 1
  }

  Write-Ok "Push successful."
  exit 0
}
catch {
  Write-Err $_.Exception.Message
  exit 1
}
