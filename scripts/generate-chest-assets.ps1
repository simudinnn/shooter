$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$dir = Join-Path $root 'assets\buildings'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

Add-Type -AssemblyName System.Drawing

function Save-Png($bmp, $path, $force) {
  if ((Test-Path $path) -and -not $force) {
    Write-Host "skip $path (exists; pass -Force to overwrite)"
    return
  }
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Host "Created $path ($($bmp.Width)x$($bmp.Height))"
}

$force = $args -contains '-Force'

function Draw-Chest($base, $trim, $lock) {
  $bmp = New-Object System.Drawing.Bitmap 16, 16
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Transparent)
  $baseBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, $base[0], $base[1], $base[2]))
  $trimBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, $trim[0], $trim[1], $trim[2]))
  $lockBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, $lock[0], $lock[1], $lock[2]))
  $g.FillRectangle($baseBrush, 2, 6, 12, 8)
  $g.FillRectangle($trimBrush, 1, 4, 14, 3)
  $g.FillRectangle($trimBrush, 1, 6, 1, 8)
  $g.FillRectangle($trimBrush, 14, 6, 1, 8)
  $g.FillRectangle($lockBrush, 7, 8, 2, 3)
  $g.Dispose()
  return $bmp
}

$variants = @{
  'chest_wood'  = @(@(120, 78, 42), @(88, 54, 28), @(200, 170, 80))
  'chest_metal' = @(@(90, 98, 108), @(60, 66, 74), @(220, 200, 120))
  'chest_rust'  = @(@(110, 62, 38), @(72, 40, 24), @(180, 140, 70))
  'chest_moss'  = @(@(70, 92, 48), @(48, 68, 32), @(160, 200, 100))
}

foreach ($name in $variants.Keys) {
  $c = $variants[$name]
  $bmp = Draw-Chest $c[0] $c[1] $c[2]
  Save-Png $bmp (Join-Path $dir "$name.png") $force
  $bmp.Dispose()
}
