$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$iconDir = Join-Path $root 'icons'
New-Item -ItemType Directory -Force -Path $iconDir | Out-Null

Add-Type -AssemblyName System.Drawing

function New-PwaIcon($size, $path) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $bg = [System.Drawing.Color]::FromArgb(255, 26, 40, 32)
  $g.Clear($bg)
  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 240, 160, 48))
  $margin = [int]($size * 0.18)
  $g.FillRectangle($brush, $margin, $margin, $size - $margin * 2, $size - $margin * 2)
  $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

New-PwaIcon 192 (Join-Path $iconDir 'icon-192.png')
New-PwaIcon 512 (Join-Path $iconDir 'icon-512.png')
Write-Host "PWA icons written to icons/"
