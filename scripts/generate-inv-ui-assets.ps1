$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$ui = Join-Path $root 'assets\ui'
$items = Join-Path $root 'assets\items'
New-Item -ItemType Directory -Force -Path $ui, $items | Out-Null

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

# 18×18 inventory slot frame — edit assets/ui/inv_slot.png
$slot = New-Object System.Drawing.Bitmap 18, 18
$sg = [System.Drawing.Graphics]::FromImage($slot)
$sg.Clear([System.Drawing.Color]::Transparent)
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 180, 50, 45))
$sg.DrawRectangle($pen, 0, 0, 17, 17)
$sg.Dispose()
Save-Png $slot (Join-Path $ui 'inv_slot.png') $force
$slot.Dispose()

# 16×16 inventory pointer — edit assets/ui/inv_cursor.png (hotspot 0,0)
$cur = New-Object System.Drawing.Bitmap 16, 16
$cg = [System.Drawing.Graphics]::FromImage($cur)
$cg.Clear([System.Drawing.Color]::Transparent)
$white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
$black = New-Object System.Drawing.Pen ([System.Drawing.Color]::Black)
$pts = @(
  [System.Drawing.Point]::new(1, 1),
  [System.Drawing.Point]::new(1, 12),
  [System.Drawing.Point]::new(4, 9),
  [System.Drawing.Point]::new(7, 14),
  [System.Drawing.Point]::new(8, 13),
  [System.Drawing.Point]::new(5, 8),
  [System.Drawing.Point]::new(9, 8)
)
$cg.FillPolygon($white, $pts)
$cg.DrawPolygon($black, $pts)
$cg.Dispose()
Save-Png $cur (Join-Path $ui 'inv_cursor.png') $force
$cur.Dispose()

# 16×16 lock icon — edit assets/items/lock.png
$lock = New-Object System.Drawing.Bitmap 16, 16
$lg = [System.Drawing.Graphics]::FromImage($lock)
$lg.Clear([System.Drawing.Color]::Transparent)
$gold = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 200, 170, 80))
$lg.FillRectangle($gold, 5, 7, 6, 7)
$lg.FillRectangle($gold, 4, 4, 8, 4)
$lg.FillRectangle([System.Drawing.Brushes]::DarkSlateGray, 7, 9, 2, 3)
$lg.Dispose()
Save-Png $lock (Join-Path $items 'lock.png') $force
$lock.Dispose()
