$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$ui = Join-Path $root 'assets\ui'
New-Item -ItemType Directory -Force -Path $ui | Out-Null
$path = Join-Path $ui 'chest_inventory.png'
$force = $args -contains '-Force'
if ((Test-Path $path) -and -not $force) {
  Write-Host "skip chest_inventory.png (exists; pass -Force to overwrite)"
  exit 0
}

Add-Type -AssemblyName System.Drawing
$w = 420
$h = 188
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(255, 20, 28, 24))

$border = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 180, 50, 45))
$g.FillRectangle($border, 6, 6, $w - 12, 3)
$g.FillRectangle($border, 6, 6, 3, $h - 12)
$g.FillRectangle($border, $w - 9, 6, 3, $h - 12)
$g.FillRectangle($border, 6, $h - 9, $w - 12, 3)

$titleBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 200, 170, 80))
$g.FillRectangle($titleBrush, 18, 14, 90, 12)

$panel = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 28, 38, 34))
$g.FillRectangle($panel, 16, 36, $w - 32, $h - 52)

$g.Dispose()
$bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "Created $path (${w}x${h})"
