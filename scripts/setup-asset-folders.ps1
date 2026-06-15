# Organize assets into folders, move existing files, generate 8-dir player placeholders.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$assets = Join-Path $root 'assets'
Add-Type -AssemblyName System.Drawing

$dirs = @(
  'player/s', 'player/se', 'player/e', 'player/ne',
  'player/n', 'player/nw', 'player/w', 'player/sw',
  'enemies', 'weapons', 'world', 'items', 'ui', 'fonts'
)
foreach ($d in $dirs) {
  New-Item -ItemType Directory -Force -Path (Join-Path $assets $d) | Out-Null
}

$moves = @{
  'player.png' = 'player/s/idle.png'
  'player_walk1.png' = 'player/s/walk_1.png'
  'player_walk2.png' = 'player/s/walk_2.png'
  'player_walk3.png' = 'player/s/walk_3.png'
  'spider.png' = 'enemies/spider.png'
  'spider_walk.png' = 'enemies/spider_walk.png'
  'pistol.png' = 'weapons/pistol.png'
  'rifle.png' = 'weapons/rifle.png'
  'shotgun.png' = 'weapons/shotgun.png'
  'sniper.png' = 'weapons/sniper.png'
  'knife.png' = 'weapons/knife.png'
  'floor.png' = 'world/floor.png'
  'floor2.png' = 'world/floor2.png'
  'floor3.png' = 'world/floor3.png'
  'floor4.png' = 'world/floor4.png'
  'wall.png' = 'world/wall.png'
  'map.png' = 'world/map.png'
  'map_collision.png' = 'world/map_collision.png'
  'ammo.png' = 'items/ammo.png'
  'bandage.png' = 'items/bandage.png'
  'mystery.png' = 'items/mystery.png'
  'mystery_weapon.png' = 'items/mystery_weapon.png'
  'bullet.png' = 'items/bullet.png'
  'crate.png' = 'items/crate.png'
  'crate2.png' = 'items/crate2.png'
  'crate3.png' = 'items/crate3.png'
  'crate4.png' = 'items/crate4.png'
  'cursor.png' = 'ui/cursor.png'
  'inventory.png' = 'ui/inventory.png'
}

foreach ($entry in $moves.GetEnumerator()) {
  $src = Join-Path $assets $entry.Key
  $dst = Join-Path $assets $entry.Value
  if (Test-Path $src) {
    if (-not (Test-Path $dst)) {
      Move-Item -Force $src $dst
      Write-Host "moved $($entry.Key) -> $($entry.Value)"
    } else {
      Remove-Item -Force $src -ErrorAction SilentlyContinue
    }
  }
}

$playerDirs = @('s', 'se', 'e', 'ne', 'n', 'nw', 'w', 'sw')
$dirColors = @{
  s = '#f0a030'; se = '#e09030'; e = '#d08028'; ne = '#c07020'
  n = '#70d090'; nw = '#60c080'; w = '#5090c0'; sw = '#4080b0'
}
$dirLabels = @{ s='S'; se='SE'; e='E'; ne='NE'; n='N'; nw='NW'; w='W'; sw='SW' }

function Get-BasePlayerBitmap {
  $southIdle = Join-Path $assets 'player/s/idle.png'
  if (Test-Path $southIdle) {
    return New-Object System.Drawing.Bitmap($southIdle)
  }
  $bmp = New-Object System.Drawing.Bitmap 24, 24
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 74, 128, 144))
  $g.FillRectangle($brush, 8, 3, 9, 8)
  $brush.Dispose()
  $g.Dispose()
  return $bmp
}

function Save-PlayerFrame($dir, $name, $base, $color, $label, $legOffset) {
  $path = Join-Path $assets "player/$dir/$name.png"
  if (Test-Path $path) { return }
  $bmp = New-Object System.Drawing.Bitmap $base
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  if ($legOffset -ne 0) {
    $g.FillRectangle(
      (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 42, 80, 96))),
      6 + $legOffset, 14, 4, 6
    )
  }
  $tag = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($color))
  $g.FillRectangle($tag, 1, 1, 6, 6)
  $tag.Dispose()
  $font = New-Object System.Drawing.Font('Arial', 5, [System.Drawing.FontStyle]::Bold)
  $g.DrawString($label, $font, [System.Drawing.Brushes]::White, 1, 0)
  $font.Dispose()
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

$base = Get-BasePlayerBitmap
foreach ($dir in $playerDirs) {
  $color = $dirColors[$dir]
  $label = $dirLabels[$dir]
  Save-PlayerFrame $dir 'idle.png' $base $color $label 0
  for ($i = 1; $i -le 4; $i++) {
    $off = ($i % 2) * 2 - 1
    Save-PlayerFrame $dir "walk_$i.png" $base $color $label $off
    Save-PlayerFrame $dir "run_$i.png" $base $color $label ($off * 2)
  }
}
$base.Dispose()

# Copy south walk frames from legacy if only 3 existed
$sWalk1 = Join-Path $assets 'player/s/walk_1.png'
if (Test-Path $sWalk1) {
  foreach ($pair in @(@('walk_1','walk_1'), @('walk_2','walk_2'), @('walk_3','walk_3'))) {
    $src = Join-Path $assets "player/s/$($pair[0]).png"
    $dst = Join-Path $assets "player/s/$($pair[1]).png"
    if ((Test-Path $src) -and -not (Test-Path (Join-Path $assets "player/s/walk_4.png"))) {
      Copy-Item $src (Join-Path $assets 'player/s/walk_4.png') -Force -ErrorAction SilentlyContinue
    }
  }
}

Write-Host 'Asset folders ready. Edit PNGs under assets/player/<direction>/'
