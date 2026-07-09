$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$ui = Join-Path $root 'assets\ui'
New-Item -ItemType Directory -Force -Path $ui | Out-Null

Add-Type -AssemblyName System.Drawing

function Save-IfMissing($bmp, $path) {
  if (Test-Path $path) {
    Write-Host "skip $path (already exists)"
    return
  }
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Host "Created $path ($($bmp.Width)x$($bmp.Height))"
}

# 48×48 panel — 16px corners/edges (edit assets/ui/ui_panel_9slice.png)
$panel = New-Object System.Drawing.Bitmap 48, 48
$pg = [System.Drawing.Graphics]::FromImage($panel)
$pg.Clear([System.Drawing.Color]::Transparent)
$fill = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 28, 38, 32))
$edge = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 180, 50, 45), 2)
$corner = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 120, 32, 28))
$pg.FillRectangle($fill, 16, 16, 16, 16)
$pg.FillRectangle($corner, 0, 0, 16, 16)
$pg.FillRectangle($corner, 32, 0, 16, 16)
$pg.FillRectangle($corner, 0, 32, 16, 16)
$pg.FillRectangle($corner, 32, 32, 16, 16)
$pg.FillRectangle($fill, 16, 0, 16, 16)
$pg.FillRectangle($fill, 16, 32, 16, 16)
$pg.FillRectangle($fill, 0, 16, 16, 16)
$pg.FillRectangle($fill, 32, 16, 16, 16)
$pg.DrawRectangle($edge, 1, 1, 45, 45)
$pg.Dispose()
Save-IfMissing $panel (Join-Path $ui 'ui_panel_9slice.png')
$panel.Dispose()

# 24×24 button — 8px corners/edges (edit assets/ui/ui_button_9slice.png)
$btn = New-Object System.Drawing.Bitmap 24, 24
$bg = [System.Drawing.Graphics]::FromImage($btn)
$bg.Clear([System.Drawing.Color]::Transparent)
$bFill = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 42, 58, 48))
$bEdge = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 200, 168, 96))
$bHi = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 240, 160, 48))
$bg.FillRectangle($bFill, 8, 8, 8, 8)
$bg.FillRectangle($bFill, 8, 0, 8, 8)
$bg.FillRectangle($bFill, 8, 16, 8, 8)
$bg.FillRectangle($bFill, 0, 8, 8, 8)
$bg.FillRectangle($bFill, 16, 8, 8, 8)
$bg.DrawRectangle($bEdge, 0, 0, 23, 23)
$bg.DrawLine($bHi, 2, 2, 21, 2)
$bg.Dispose()
Save-IfMissing $btn (Join-Path $ui 'ui_button_9slice.png')
$btn.Dispose()
