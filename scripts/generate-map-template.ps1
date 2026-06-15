# Creates starter map.png + map_collision.png (skips if files already exist).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $root 'assets'
New-Item -ItemType Directory -Force -Path $assets | Out-Null
Add-Type -AssemblyName System.Drawing

$w = 512
$h = 512
$mapPath = Join-Path $assets 'map.png'
$colPath = Join-Path $assets 'map_collision.png'

if ((Test-Path $mapPath) -and (Test-Path $colPath)) {
  Write-Host "map.png and map_collision.png already exist - skipped"
  exit 0
}

function Fill-Rect($g, $x, $y, $rw, $rh, $color) {
  $brush = New-Object System.Drawing.SolidBrush $color
  $g.FillRectangle($brush, $x, $y, $rw, $rh)
  $brush.Dispose()
}

$mapBmp = New-Object System.Drawing.Bitmap $w, $h
$mapG = [System.Drawing.Graphics]::FromImage($mapBmp)
$mapG.Clear([System.Drawing.Color]::FromArgb(58, 90, 62))

# Outer walls (visual)
Fill-Rect $mapG 0 0 $w 24 ([System.Drawing.Color]::FromArgb(90, 85, 80))
Fill-Rect $mapG 0 ($h - 24) $w 24 ([System.Drawing.Color]::FromArgb(90, 85, 80))
Fill-Rect $mapG 0 0 24 $h ([System.Drawing.Color]::FromArgb(90, 85, 80))
Fill-Rect $mapG ($w - 24) 0 24 $h ([System.Drawing.Color]::FromArgb(90, 85, 80))

# Inner room
Fill-Rect $mapG 180 180 152 152 ([System.Drawing.Color]::FromArgb(74, 74, 78))
Fill-Rect $mapG 220 320 72 24 ([System.Drawing.Color]::FromArgb(90, 85, 80))

$colBmp = New-Object System.Drawing.Bitmap $w, $h
$colG = [System.Drawing.Graphics]::FromImage($colBmp)
$colG.Clear([System.Drawing.Color]::FromArgb(0, 80, 220))

# Red = blocked (same shapes as walls above)
$red = [System.Drawing.Color]::FromArgb(220, 40, 40)
Fill-Rect $colG 0 0 $w 24 $red
Fill-Rect $colG 0 ($h - 24) $w 24 $red
Fill-Rect $colG 0 0 24 $h $red
Fill-Rect $colG ($w - 24) 0 24 $h $red
Fill-Rect $colG 180 180 152 152 $red
Fill-Rect $colG 220 320 72 24 $red

$mapG.Dispose()
$colG.Dispose()

if (-not (Test-Path $mapPath)) {
  $mapBmp.Save($mapPath, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Host "  map.png ($w x $h)"
} else {
  Write-Host "  skip map.png (already exists)"
}

if (-not (Test-Path $colPath)) {
  $colBmp.Save($colPath, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Host "  map_collision.png ($w x $h)"
} else {
  Write-Host "  skip map_collision.png (already exists)"
}

$mapBmp.Dispose()
$colBmp.Dispose()
Write-Host "Done - edit both images with matching layouts (blue=walk, red=walls)"
