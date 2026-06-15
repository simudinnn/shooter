# Flatten right-facing player sprites to assets/player/ (idle, walk_1-4, run_1-4)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$player = Join-Path $root 'assets\player'
$right = Join-Path $player 'right'
New-Item -ItemType Directory -Force -Path $player | Out-Null

function Copy-IfExists($src, $dst) {
  if (Test-Path $src) {
    Copy-Item -Force $src $dst
    Write-Host "copied -> player/$(Split-Path $dst -Leaf)"
    return $true
  }
  return $false
}

# Prefer assets/player/right/, then flat root, then legacy left/right names
$idleSrc = @(
  (Join-Path $right 'idle.png'),
  (Join-Path $player 'idle.png')
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($idleSrc) {
  Copy-Item -Force $idleSrc (Join-Path $player 'idle.png')
  Write-Host "copied -> player/idle.png"
}

for ($i = 1; $i -le 4; $i++) {
  $walkNames = @(
    "r_walk$i.png", "l_walk$i.png", "walk_$i.png", "walk$i.png"
  )
  $runNames = @(
    "r_run$i.png", "l_run$i.png", "run_$i.png", "run$i.png"
  )

  foreach ($name in $walkNames) {
    $src = Join-Path $right $name
    if (-not (Test-Path $src)) { $src = Join-Path $player $name }
    if (Copy-IfExists $src (Join-Path $player "walk_$i.png")) { break }
  }

  foreach ($name in $runNames) {
    $src = Join-Path $right $name
    if (-not (Test-Path $src)) { $src = Join-Path $player $name }
    if (Copy-IfExists $src (Join-Path $player "run_$i.png")) { break }
  }
}

foreach ($dir in @('left', 'right', 's', 'se', 'e', 'ne', 'n', 'nw', 'w', 'sw')) {
  $path = Join-Path $player $dir
  if (Test-Path $path) {
    Remove-Item -Recurse -Force $path
    Write-Host "removed player/$dir"
  }
}

Write-Host 'Player sprites: assets/player/{idle,walk_1..4,run_1..4}.png'
