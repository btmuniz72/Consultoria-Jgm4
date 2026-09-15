param(
    [Parameter(Mandatory)]
    [string]$Root,
    [int]$Port = 8765
)

$ErrorActionPreference = 'Stop'
$rootPath = (Resolve-Path -LiteralPath $Root).Path.TrimEnd('\')
$listener = [Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()

$mimeTypes = @{
    '.css' = 'text/css; charset=utf-8'
    '.html' = 'text/html; charset=utf-8'
    '.ico' = 'image/x-icon'
    '.jpg' = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.js' = 'application/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.php' = 'text/plain; charset=utf-8'
    '.png' = 'image/png'
    '.svg' = 'image/svg+xml'
    '.webmanifest' = 'application/manifest+json; charset=utf-8'
    '.webp' = 'image/webp'
    '.xml' = 'application/xml; charset=utf-8'
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        try {
            $relative = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath).TrimStart('/')
            if (-not $relative) { $relative = 'index.html' }
            $candidate = [IO.Path]::GetFullPath((Join-Path $rootPath ($relative -replace '/', '\')))

            if (-not $candidate.StartsWith($rootPath + '\', [StringComparison]::OrdinalIgnoreCase)) {
                $context.Response.StatusCode = 403
                $context.Response.Close()
                continue
            }
            if (Test-Path -LiteralPath $candidate -PathType Container) {
                $candidate = Join-Path $candidate 'index.html'
            }
            if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
                $context.Response.StatusCode = 404
                $context.Response.Close()
                continue
            }

            $bytes = [IO.File]::ReadAllBytes($candidate)
            $extension = [IO.Path]::GetExtension($candidate).ToLowerInvariant()
            $context.Response.ContentType = if ($mimeTypes.ContainsKey($extension)) {
                $mimeTypes[$extension]
            } else {
                'application/octet-stream'
            }
            $context.Response.ContentLength64 = $bytes.Length
            $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
            $context.Response.OutputStream.Close()
        } catch {
            $context.Response.StatusCode = 500
            $context.Response.Close()
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
