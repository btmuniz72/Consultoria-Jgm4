[CmdletBinding()]
param(
    [string]$Source = (Join-Path (Split-Path -Parent $PSScriptRoot) 'assets\favicon.ico'),
    [string]$Destination = (Join-Path (Split-Path -Parent $PSScriptRoot) 'assets\brand')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function New-ScaledBitmap {
    param(
        [Parameter(Mandatory)][Drawing.Bitmap]$SourceBitmap,
        [Parameter(Mandatory)][int]$Size
    )

    $result = [Drawing.Bitmap]::new($Size, $Size, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $result.SetResolution(96, 96)
    $graphics = [Drawing.Graphics]::FromImage($result)
    try {
        $graphics.Clear([Drawing.Color]::Transparent)
        $graphics.CompositingMode = [Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.CompositingQuality = [Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.DrawImage($SourceBitmap, [Drawing.Rectangle]::new(0, 0, $Size, $Size))
    } finally {
        $graphics.Dispose()
    }
    return $result
}

function Convert-BitmapToPngBytes {
    param([Parameter(Mandatory)][Drawing.Bitmap]$Bitmap)
    $stream = [IO.MemoryStream]::new()
    try {
        $Bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
        return $stream.ToArray()
    } finally {
        $stream.Dispose()
    }
}

[IO.Directory]::CreateDirectory($Destination) | Out-Null
$sourceBitmap = [Drawing.Bitmap]::FromFile((Resolve-Path -LiteralPath $Source).Path)
try {
    $minX = $sourceBitmap.Width
    $minY = $sourceBitmap.Height
    $maxX = -1
    $maxY = -1

    for ($y = 0; $y -lt $sourceBitmap.Height; $y++) {
        for ($x = 0; $x -lt $sourceBitmap.Width; $x++) {
            if ($sourceBitmap.GetPixel($x, $y).A -gt 8) {
                if ($x -lt $minX) { $minX = $x }
                if ($x -gt $maxX) { $maxX = $x }
                if ($y -lt $minY) { $minY = $y }
                if ($y -gt $maxY) { $maxY = $y }
            }
        }
    }

    if ($maxX -lt 0 -or $maxY -lt 0) {
        throw 'A imagem de origem nao possui pixels visiveis.'
    }

    $contentWidth = $maxX - $minX + 1
    $contentHeight = $maxY - $minY + 1
    $cropSize = [Math]::Min([Math]::Max($contentWidth, $contentHeight) + 36, [Math]::Min($sourceBitmap.Width, $sourceBitmap.Height))
    $centerX = ($minX + $maxX) / 2.0
    $centerY = ($minY + $maxY) / 2.0
    $cropX = [Math]::Max(0, [Math]::Min($sourceBitmap.Width - $cropSize, [Math]::Round($centerX - ($cropSize / 2.0))))
    $cropY = [Math]::Max(0, [Math]::Min($sourceBitmap.Height - $cropSize, [Math]::Round($centerY - ($cropSize / 2.0))))
    $cropRectangle = [Drawing.Rectangle]::new([int]$cropX, [int]$cropY, [int]$cropSize, [int]$cropSize)

    $cropped = [Drawing.Bitmap]::new($cropSize, $cropSize, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $cropGraphics = [Drawing.Graphics]::FromImage($cropped)
    try {
        $cropGraphics.Clear([Drawing.Color]::Transparent)
        $cropGraphics.CompositingMode = [Drawing.Drawing2D.CompositingMode]::SourceCopy
        $cropGraphics.DrawImage(
            $sourceBitmap,
            [Drawing.Rectangle]::new(0, 0, $cropSize, $cropSize),
            $cropRectangle,
            [Drawing.GraphicsUnit]::Pixel
        )
    } finally {
        $cropGraphics.Dispose()
    }

    try {
        foreach ($size in 48, 96, 192, 512) {
            $scaled = New-ScaledBitmap -SourceBitmap $cropped -Size $size
            try {
                $scaled.Save((Join-Path $Destination "favicon-${size}x${size}.png"), [Drawing.Imaging.ImageFormat]::Png)
                if ($size -eq 512) {
                    $scaled.Save((Join-Path $Destination 'favicon.png'), [Drawing.Imaging.ImageFormat]::Png)
                }
            } finally {
                $scaled.Dispose()
            }
        }

        $frames = [Collections.Generic.List[object]]::new()
        foreach ($size in 16, 32, 48, 256) {
            $scaled = New-ScaledBitmap -SourceBitmap $cropped -Size $size
            try {
                $frames.Add([pscustomobject]@{ Size = $size; Bytes = Convert-BitmapToPngBytes -Bitmap $scaled })
            } finally {
                $scaled.Dispose()
            }
        }

        $icoPath = Join-Path $Destination 'favicon.ico'
        $file = [IO.File]::Create($icoPath)
        $writer = [IO.BinaryWriter]::new($file)
        try {
            $writer.Write([uint16]0)
            $writer.Write([uint16]1)
            $writer.Write([uint16]$frames.Count)
            $offset = 6 + (16 * $frames.Count)
            foreach ($frame in $frames) {
                $dimension = if ($frame.Size -ge 256) { [byte]0 } else { [byte]$frame.Size }
                $writer.Write($dimension)
                $writer.Write($dimension)
                $writer.Write([byte]0)
                $writer.Write([byte]0)
                $writer.Write([uint16]1)
                $writer.Write([uint16]32)
                $writer.Write([uint32]$frame.Bytes.Length)
                $writer.Write([uint32]$offset)
                $offset += $frame.Bytes.Length
            }
            foreach ($frame in $frames) {
                $writer.Write([byte[]]$frame.Bytes)
            }
        } finally {
            $writer.Dispose()
            $file.Dispose()
        }
    } finally {
        $cropped.Dispose()
    }

    [pscustomobject]@{
        origem = (Resolve-Path -LiteralPath $Source).Path
        area_original = "$($sourceBitmap.Width)x$($sourceBitmap.Height)"
        conteudo_detectado = "$contentWidth`x$contentHeight"
        recorte_quadrado = "$cropSize`x$cropSize"
        destino = (Resolve-Path -LiteralPath $Destination).Path
    }
} finally {
    $sourceBitmap.Dispose()
}
