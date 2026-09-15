param(
    [string]$SiteRoot = (Split-Path -Parent $PSScriptRoot),
    [int]$Port = 8765,
    [string]$LogPath = (Join-Path $PSScriptRoot 'servidor-local-testes.log')
)

$ErrorActionPreference = 'Continue'
$root = (Resolve-Path -LiteralPath $SiteRoot).Path
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
$listener.Start()

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.css' = 'text/css; charset=utf-8'
    '.js' = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.webmanifest' = 'application/manifest+json; charset=utf-8'
    '.xml' = 'application/xml; charset=utf-8'
    '.txt' = 'text/plain; charset=utf-8'
    '.png' = 'image/png'
    '.jpg' = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.webp' = 'image/webp'
    '.ico' = 'image/x-icon'
    '.svg' = 'image/svg+xml'
    '.pdf' = 'application/pdf'
}

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        $stream = $null
        try {
            $client.ReceiveTimeout = 2000
            $client.SendTimeout = 5000
            $stream = $client.GetStream()
            $buffer = [byte[]]::new(16384)
            $count = $stream.Read($buffer, 0, $buffer.Length)
            if ($count -le 0) { continue }
            $requestLine = ([Text.Encoding]::ASCII.GetString($buffer, 0, $count) -split "`r?`n", 2)[0]
            $parts = $requestLine -split ' '
            if ($parts.Count -lt 2) { continue }
            $method = $parts[0]
            $rawTarget = $parts[1]
            $absolutePath = ([Uri]::new("http://localhost$rawTarget")).AbsolutePath
            $requestPath = [Uri]::UnescapeDataString($absolutePath).TrimStart('/')
            if (-not $requestPath -or $requestPath.EndsWith('/')) { $requestPath += 'index.html' }
            $candidate = [IO.Path]::GetFullPath((Join-Path $root $requestPath.Replace('/', [IO.Path]::DirectorySeparatorChar)))
            $status = 200
            if (-not $candidate.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
                $status = 404
                $candidate = Join-Path $root '404.html'
            }
            $bytes = [IO.File]::ReadAllBytes($candidate)
            $extension = [IO.Path]::GetExtension($candidate).ToLowerInvariant()
            $contentType = if ($mime.ContainsKey($extension)) { $mime[$extension] } else { 'application/octet-stream' }
            $reason = if ($status -eq 200) { 'OK' } else { 'Not Found' }
            $header = "HTTP/1.1 $status $reason`r`nContent-Type: $contentType`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n`r`n"
            $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            if ($method -ne 'HEAD') { $stream.Write($bytes, 0, $bytes.Length) }
            $stream.Flush()
            Add-Content -LiteralPath $LogPath -Value "$(Get-Date -Format o)`t$status`t$method`t$absolutePath" -Encoding utf8
        }
        catch {
            Add-Content -LiteralPath $LogPath -Value "$(Get-Date -Format o)`tERRO`t$($_.Exception.Message)" -Encoding utf8
        }
        finally {
            if ($stream) { $stream.Dispose() }
            $client.Dispose()
        }
    }
}
finally {
    $listener.Stop()
}
