# Generates ONLY new sprite PNGs (does not overwrite existing assets).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $root 'assets'
New-Item -ItemType Directory -Force -Path $assets | Out-Null
Add-Type -AssemblyName System.Drawing

function New-IconBitmap($name, $rects) {
  $path = Join-Path $assets "$name.png"
  if (Test-Path $path) {
    Write-Host "  skip $name.png (already exists)"
    return
  }
  $bmp = New-Object System.Drawing.Bitmap 16, 16
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
  foreach ($r in $rects) {
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($r.c))
    $g.FillRectangle($brush, $r.x, $r.y, $r.w, $r.h)
    $brush.Dispose()
  }
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "  $name.png"
}

Write-Host "Adding new sprites to $assets (skips existing files)..."

New-IconBitmap 'cursor' @(
  @{ x=7; y=2; w=2; h=12; c='#f0a030' }
  @{ x=2; y=7; w=12; h=2; c='#f0a030' }
  @{ x=6; y=6; w=4; h=4; c='#ffe880' }
)

New-IconBitmap 'crate2' @(
  @{ x=2; y=4; w=12; h=10; c='#8a6040' }
  @{ x=3; y=5; w=10; h=2; c='#6a4828' }
  @{ x=5; y=7; w=6; h=4; c='#a07850' }
)

New-IconBitmap 'crate3' @(
  @{ x=1; y=3; w=14; h=11; c='#7a5838' }
  @{ x=2; y=4; w=12; h=2; c='#5a4028' }
  @{ x=4; y=8; w=8; h=4; c='#9a7858' }
)

New-IconBitmap 'crate4' @(
  @{ x=3; y=5; w=10; h=9; c='#6a5030' }
  @{ x=4; y=6; w=8; h=3; c='#4a3820' }
  @{ x=2; y=3; w=3; h=3; c='#8a6848' }
)

New-IconBitmap 'pistol' @(
  @{ x=4; y=6; w=8; h=3; c='#606870' }
  @{ x=9; y=5; w=4; h=4; c='#4a3828' }
  @{ x=3; y=8; w=3; h=4; c='#5a4030' }
)

Write-Host "Done"
