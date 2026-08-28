Add-Type -AssemblyName System.Drawing

$inputPath = Join-Path $PSScriptRoot "public\logo.jpg"
$img = [System.Drawing.Image]::FromFile($inputPath)

function Resize-Image($source, $width, $height, $outputPath) {
    $bmp = New-Object System.Drawing.Bitmap($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.DrawImage($source, 0, 0, $width, $height)
    $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose()
    $bmp.Dispose()
    Write-Host "Created $outputPath"
}

Resize-Image $img 192 192 (Join-Path $PSScriptRoot "public\icon-192.png")
Resize-Image $img 512 512 (Join-Path $PSScriptRoot "public\icon-512.png")
Resize-Image $img 180 180 (Join-Path $PSScriptRoot "public\apple-touch-icon.png")

$img.Dispose()
Write-Host "All PWA PNG icons generated successfully!"
