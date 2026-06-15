$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$assets = Join-Path $root 'assets'
New-Item -ItemType Directory -Force -Path $assets | Out-Null
$path = Join-Path $assets 'inventory.png'
$force = $args -contains '-Force'
if ((Test-Path $path) -and -not $force) {
  Write-Host 'skip inventory.png (already exists; pass -Force to overwrite)'
  exit 0
}

Add-Type -AssemblyName System.Drawing
$w = 520
$h = 340
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(255, 20, 28, 24))

$border = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 240, 160, 48))
$g.FillRectangle($border, 6, 6, $w - 12, 3)
$g.FillRectangle($border, 6, 6, 3, $h - 12)
$g.FillRectangle($border, $w - 9, 6, 3, $h - 12)
$g.FillRectangle($border, 6, $h - 9, $w - 12, 3)

$titleBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 240, 160, 48))
$g.FillRectangle($titleBrush, 18, 14, 140, 14)

$leftPanel = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 26, 36, 32))
$rightPanel = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 30, 42, 36))
$g.FillRectangle($leftPanel, 16, 40, 188, 280)
$g.FillRectangle($rightPanel, 216, 40, 288, 280)

$divider = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(80, 240, 160, 48))
$g.DrawLine($divider, 208, 48, 208, 312)

$g.Dispose()
$bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "Created $path (${w}x${h})"
