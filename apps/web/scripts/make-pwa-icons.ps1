# Genere les icones d'installation de la PWA a partir du logotype.
#
#     powershell -File apps/web/scripts/make-pwa-icons.ps1
#
# Outil ponctuel : les PNG produits sont versionnes dans apps/web/public/icons/.
# On ne le relance que si le logo change. (Equivalent Windows de
# make-favicon.py, sans dependance Python.)
#
# Fond BLANC partout : Android et iOS aplatissent la transparence sur du noir,
# ce qui rendrait « Immo » (marine) illisible. Le logotype est large (3,45:1) :
#   - icon-192 / icon-512 (purpose "any") : 88 % de la largeur ;
#   - icon-maskable-512 : 62 % de la largeur, pour rester dans la zone sure
#     (disque central de 80 %) quand Android decoupe l'icone en cercle.
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'src/assets/logo-immotopia.png'
$out = Join-Path $root 'public/icons'
New-Item -ItemType Directory -Force -Path $out | Out-Null

$logo = [System.Drawing.Bitmap]::FromFile($src)

# Boite englobante des pixels non transparents.
$minX = $logo.Width; $minY = $logo.Height; $maxX = 0; $maxY = 0
for ($y = 0; $y -lt $logo.Height; $y++) {
  for ($x = 0; $x -lt $logo.Width; $x++) {
    if ($logo.GetPixel($x, $y).A -gt 8) {
      if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
$crop = New-Object System.Drawing.Rectangle $minX, $minY, ($maxX - $minX + 1), ($maxY - $minY + 1)

function New-Icon([int]$size, [double]$fill, [string]$name) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::White)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $w = $size * $fill
  $h = $w * $crop.Height / $crop.Width
  $dest = New-Object System.Drawing.RectangleF (($size - $w) / 2), (($size - $h) / 2), $w, $h
  $g.DrawImage($logo, $dest, [System.Drawing.RectangleF]$crop, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  $bmp.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

New-Icon 192 0.88 'icon-192.png'
New-Icon 512 0.88 'icon-512.png'
New-Icon 512 0.62 'icon-maskable-512.png'
$logo.Dispose()
Write-Host "Icones ecrites dans $out"
