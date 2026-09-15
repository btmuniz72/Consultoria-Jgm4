[CmdletBinding()]
param(
    [string]$Version = '20260811-2',
    [string]$SiteRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$utf8NoBom = [Text.UTF8Encoding]::new($false)
$roots = @(
    'index.html',
    'index-en.html',
    'index-es.html',
    '404.html',
    'pages',
    'blog',
    'consultor-logistico',
    'consultoria-logistica-para-pequenas-empresas',
    'ferramentas'
)

$files = [Collections.Generic.List[IO.FileInfo]]::new()
foreach ($root in $roots) {
    $path = Join-Path $SiteRoot $root
    if (Test-Path -LiteralPath $path -PathType Leaf) {
        $files.Add((Get-Item -LiteralPath $path))
    } elseif (Test-Path -LiteralPath $path -PathType Container) {
        foreach ($file in Get-ChildItem -LiteralPath $path -Recurse -File -Filter '*.html') {
            $files.Add($file)
        }
    }
}
$files.Add((Get-Item -LiteralPath (Join-Path $SiteRoot 'site.webmanifest')))

$assets = @(
    '/css/brand.css',
    '/assets/brand/favicon.ico',
    '/assets/brand/favicon-48x48.png',
    '/assets/brand/favicon-96x96.png',
    '/assets/brand/favicon-192x192.png',
    '/assets/brand/favicon-512x512.png'
)

$changed = [Collections.Generic.List[string]]::new()
foreach ($file in $files | Sort-Object FullName -Unique) {
    $content = [IO.File]::ReadAllText($file.FullName)
    $updated = $content
    foreach ($asset in $assets) {
        $escaped = [regex]::Escape($asset)
        $updated = [regex]::Replace(
            $updated,
            "$escaped(?:\?v=[A-Za-z0-9._-]+)?(?=[`"'])",
            "$asset`?v=$Version"
        )
    }
    if ($updated -ne $content) {
        [IO.File]::WriteAllText($file.FullName, $updated, $utf8NoBom)
        $changed.Add($file.FullName.Substring($SiteRoot.Length).TrimStart('\', '/'))
    }
}

[pscustomobject]@{
    versao = $Version
    arquivos_atualizados = $changed.Count
}
$changed
