$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$ui = Join-Path $root 'assets\ui'
New-Item -ItemType Directory -Force -Path $ui | Out-Null

Add-Type -AssemblyName System.Drawing

$path = Join-Path $ui 'craft_toggle.png'
if (Test-Path $path) {
  Write-Host "skip craft_toggle.png (already exists; delete manually to regenerate)"
  exit 0
}

# 22×128 vertical craft tab — edit assets/ui/craft_toggle.png
$toggle = New-Object System.Drawing.Bitmap 22, 128
$tg = [System.Drawing.Graphics]::FromImage($toggle)
$tg.Clear([System.Drawing.Color]::Transparent)
$bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 34, 48, 40))
$edge = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 200, 168, 96))
$accent = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 240, 160, 48))
$tg.FillRectangle($bg, 1, 1, 20, 126)
$tg.DrawRectangle($edge, 0, 0, 21, 127)
$tg.DrawLine($accent, 3, 8, 3, 120)
$tg.DrawLine($accent, 18, 8, 18, 120)
$tg.Dispose()
$toggle.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
$toggle.Dispose()
Write-Host "Created $path (22x128)"
