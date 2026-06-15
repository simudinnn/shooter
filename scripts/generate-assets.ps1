# Generates default 16x16 pixel-art PNGs into assets/
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $root 'assets'
New-Item -ItemType Directory -Force -Path $assets | Out-Null
Add-Type -AssemblyName System.Drawing

function New-SpriteBitmap($name, $rects, $size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
  foreach ($r in $rects) {
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($r.c))
    $g.FillRectangle($brush, $r.x, $r.y, $r.w, $r.h)
    $brush.Dispose()
  }
  $g.Dispose()
  $path = Join-Path $assets "$name.png"
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "  $name.png"
}

function New-CharBitmap($name, $rects) { New-SpriteBitmap $name $rects 24 }
function New-IconBitmap($name, $rects) { New-SpriteBitmap $name $rects 16 }

Write-Host "Generating assets in $assets ..."

New-CharBitmap 'player' @(
  @{ x=8; y=3; w=9; h=8; c='#4a8090' }
  @{ x=9; y=1; w=6; h=3; c='#d4a878' }
  @{ x=6; y=11; w=5; h=8; c='#2a5060' }
  @{ x=14; y=11; w=5; h=8; c='#2a5060' }
  @{ x=9; y=11; w=6; h=6; c='#3a6070' }
)

New-CharBitmap 'player_walk1' @(
  @{ x=8; y=3; w=9; h=8; c='#4a8090' }
  @{ x=9; y=1; w=6; h=3; c='#d4a878' }
  @{ x=5; y=12; w=5; h=6; c='#2a5060' }
  @{ x=15; y=9; w=5; h=9; c='#2a5060' }
  @{ x=9; y=11; w=6; h=6; c='#3a6070' }
)

New-CharBitmap 'player_walk2' @(
  @{ x=8; y=3; w=9; h=8; c='#4a8090' }
  @{ x=9; y=1; w=6; h=3; c='#d4a878' }
  @{ x=8; y=11; w=5; h=8; c='#2a5060' }
  @{ x=12; y=11; w=5; h=8; c='#2a5060' }
  @{ x=9; y=11; w=6; h=6; c='#3a6070' }
)

New-CharBitmap 'player_walk3' @(
  @{ x=8; y=3; w=9; h=8; c='#4a8090' }
  @{ x=9; y=1; w=6; h=3; c='#d4a878' }
  @{ x=15; y=9; w=5; h=9; c='#2a5060' }
  @{ x=5; y=12; w=5; h=6; c='#2a5060' }
  @{ x=9; y=11; w=6; h=6; c='#3a6070' }
)

New-CharBitmap 'zombie' @(
  @{ x=8; y=3; w=9; h=8; c='#4a6a38' }
  @{ x=9; y=1; w=6; h=3; c='#8aaa70' }
  @{ x=8; y=5; w=3; h=3; c='#302818' }
  @{ x=14; y=5; w=3; h=3; c='#302818' }
  @{ x=6; y=11; w=5; h=8; c='#2a4020' }
  @{ x=14; y=11; w=5; h=8; c='#2a4020' }
  @{ x=5; y=8; w=3; h=6; c='#6a3028' }
  @{ x=17; y=8; w=3; h=6; c='#6a3028' }
)

New-CharBitmap 'zombie_walk1' @(
  @{ x=8; y=3; w=9; h=8; c='#4a6a38' }
  @{ x=9; y=1; w=6; h=3; c='#8aaa70' }
  @{ x=8; y=5; w=3; h=3; c='#302818' }
  @{ x=14; y=5; w=3; h=3; c='#302818' }
  @{ x=5; y=12; w=5; h=6; c='#2a4020' }
  @{ x=15; y=9; w=5; h=9; c='#2a4020' }
  @{ x=3; y=9; w=3; h=5; c='#6a3028' }
  @{ x=18; y=6; w=3; h=8; c='#6a3028' }
)

New-CharBitmap 'zombie_walk2' @(
  @{ x=8; y=3; w=9; h=8; c='#4a6a38' }
  @{ x=9; y=1; w=6; h=3; c='#8aaa70' }
  @{ x=8; y=5; w=3; h=3; c='#302818' }
  @{ x=14; y=5; w=3; h=3; c='#302818' }
  @{ x=8; y=11; w=5; h=8; c='#2a4020' }
  @{ x=12; y=11; w=5; h=8; c='#2a4020' }
  @{ x=5; y=8; w=3; h=6; c='#6a3028' }
  @{ x=17; y=8; w=3; h=6; c='#6a3028' }
)

New-CharBitmap 'zombie_walk3' @(
  @{ x=8; y=3; w=9; h=8; c='#4a6a38' }
  @{ x=9; y=1; w=6; h=3; c='#8aaa70' }
  @{ x=8; y=5; w=3; h=3; c='#302818' }
  @{ x=14; y=5; w=3; h=3; c='#302818' }
  @{ x=15; y=9; w=5; h=9; c='#2a4020' }
  @{ x=5; y=12; w=5; h=6; c='#2a4020' }
  @{ x=18; y=6; w=3; h=8; c='#6a3028' }
  @{ x=3; y=9; w=3; h=5; c='#6a3028' }
)

New-CharBitmap 'zombie_walk4' @(
  @{ x=8; y=3; w=9; h=8; c='#4a6a38' }
  @{ x=9; y=1; w=6; h=3; c='#8aaa70' }
  @{ x=8; y=5; w=3; h=3; c='#302818' }
  @{ x=14; y=5; w=3; h=3; c='#302818' }
  @{ x=8; y=10; w=5; h=7; c='#2a4020' }
  @{ x=12; y=12; w=5; h=7; c='#2a4020' }
  @{ x=6; y=7; w=3; h=7; c='#6a3028' }
  @{ x=16; y=9; w=3; h=6; c='#6a3028' }
)

New-IconBitmap 'wall' @(
  @{ x=0; y=0; w=16; h=16; c='#8a8580' }
  @{ x=1; y=1; w=14; h=2; c='#f0a030' }
  @{ x=2; y=4; w=12; h=10; c='#6a6560' }
)

New-IconBitmap 'floor' @(
  @{ x=0; y=0; w=16; h=16; c='#4a6a52' }
  @{ x=0; y=0; w=7; h=7; c='#3a5a42' }
  @{ x=9; y=9; w=7; h=7; c='#5a7a62' }
)

New-IconBitmap 'floor2' @(
  @{ x=0; y=0; w=16; h=16; c='#456248' }
  @{ x=2; y=2; w=6; h=6; c='#3a5540' }
  @{ x=10; y=8; w=6; h=6; c='#567a58' }
)

New-IconBitmap 'floor3' @(
  @{ x=0; y=0; w=16; h=16; c='#526a50' }
  @{ x=8; y=0; w=8; h=8; c='#425a40' }
  @{ x=0; y=8; w=8; h=8; c='#627a60' }
)

New-IconBitmap 'floor4' @(
  @{ x=0; y=0; w=16; h=16; c='#3e5a46' }
  @{ x=4; y=4; w=8; h=8; c='#4d6b52' }
  @{ x=0; y=0; w=4; h=16; c='#354f3c' }
)

New-CharBitmap 'rifle' @(
  @{ x=6; y=10; w=12; h=3; c='#707880' }
  @{ x=14; y=9; w=4; h=2; c='#3a4048' }
  @{ x=5; y=11; w=4; h=5; c='#5a4030' }
)

New-CharBitmap 'pistol' @(
  @{ x=8; y=10; w=8; h=3; c='#606870' }
  @{ x=13; y=9; w=4; h=4; c='#4a3828' }
  @{ x=7; y=12; w=3; h=4; c='#5a4030' }
)

New-CharBitmap 'shotgun' @(
  @{ x=5; y=10; w=13; h=4; c='#6a5038' }
  @{ x=7; y=9; w=10; h=2; c='#3a3028' }
  @{ x=15; y=10; w=3; h=2; c='#909098' }
)

New-CharBitmap 'sniper' @(
  @{ x=4; y=10; w=15; h=2; c='#3a4048' }
  @{ x=8; y=8; w=6; h=3; c='#2a3038' }
  @{ x=16; y=9; w=3; h=2; c='#f0a030' }
)

New-CharBitmap 'knife' @(
  @{ x=12; y=8; w=2; h=9; c='#c0c4cc' }
  @{ x=11; y=15; w=4; h=3; c='#5a4030' }
  @{ x=12; y=7; w=2; h=2; c='#e8ecf0' }
)

New-IconBitmap 'ammo' @(
  @{ x=3; y=4; w=10; h=9; c='#3a8a44' }
  @{ x=5; y=6; w=6; h=4; c='#ffee44' }
)

New-IconBitmap 'bandage' @(
  @{ x=2; y=2; w=12; h=12; c='#f0ece8' }
  @{ x=6; y=4; w=4; h=8; c='#ff3030' }
  @{ x=4; y=6; w=8; h=4; c='#ff3030' }
)

New-IconBitmap 'mystery' @(
  @{ x=2; y=2; w=12; h=12; c='#7744cc' }
  @{ x=4; y=4; w=8; h=8; c='#aa66ff' }
  @{ x=6; y=6; w=4; h=4; c='#ffee88' }
)

New-IconBitmap 'mystery_weapon' @(
  @{ x=2; y=3; w=12; h=10; c='#cc8822' }
  @{ x=4; y=5; w=8; h=6; c='#ffaa22' }
  @{ x=6; y=6; w=4; h=3; c='#ffffff' }
)

New-IconBitmap 'bullet' @(
  @{ x=7; y=4; w=2; h=8; c='#ffe040' }
)

New-IconBitmap 'crate' @(
  @{ x=2; y=4; w=12; h=10; c='#9a7048' }
  @{ x=3; y=5; w=10; h=2; c='#7a5038' }
)

Write-Host "Done - $($assets)"
