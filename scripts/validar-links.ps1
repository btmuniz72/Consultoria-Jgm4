param([string]$SiteRoot = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = 'Stop'
$origin = [uri]'https://www.jgm4consultoria.com.br/'
[xml]$sitemap = Get-Content -Raw -LiteralPath (Join-Path $SiteRoot 'sitemap.xml')
$ns = New-Object Xml.XmlNamespaceManager($sitemap.NameTable)
$ns.AddNamespace('sm', 'http://www.sitemaps.org/schemas/sitemap/0.9')
$urls = @($sitemap.SelectNodes('//sm:url/sm:loc', $ns) | ForEach-Object { $_.InnerText.Trim() })

function Get-LocalFile([uri]$url) {
    if ($url.AbsolutePath -eq '/') { return Join-Path $SiteRoot 'index.html' }
    $relative = [Uri]::UnescapeDataString($url.AbsolutePath.TrimStart('/')).Replace('/', [IO.Path]::DirectorySeparatorChar)
    if ($url.AbsolutePath.EndsWith('/')) { return Join-Path (Join-Path $SiteRoot $relative) 'index.html' }
    return Join-Path $SiteRoot $relative
}

$problems = @()
$checked = 0
foreach ($pageUrl in $urls) {
    $base = [uri]$pageUrl
    $sourceFile = Get-LocalFile $base
    $html = Get-Content -Raw -LiteralPath $sourceFile
    $attributes = [regex]::Matches($html, '(?:href|src)=["'']([^"'']+)["'']', 'IgnoreCase')
    foreach ($attribute in $attributes) {
        $value = [Net.WebUtility]::HtmlDecode($attribute.Groups[1].Value.Trim())
        if (-not $value -or $value -match '^(?:mailto:|tel:|javascript:|data:|blob:)' -or $value.StartsWith('//')) { continue }
        try { $target = [uri]::new($base, $value) } catch { continue }
        if ($target.Host -ne $origin.Host) { continue }
        $checked++
        $targetFile = Get-LocalFile $target
        if (-not (Test-Path -LiteralPath $targetFile -PathType Leaf)) {
            $problems += [pscustomobject]@{ source = $pageUrl; target = $value; problem = 'arquivo ausente' }
            continue
        }
        if ($target.Fragment) {
            $fragment = [regex]::Escape([Uri]::UnescapeDataString($target.Fragment.TrimStart('#')))
            $targetHtml = Get-Content -Raw -LiteralPath $targetFile
            if ($targetHtml -notmatch "(?:id|name)=[""']$fragment[""']") {
                $problems += [pscustomobject]@{ source = $pageUrl; target = $value; problem = 'âncora ausente' }
            }
        }
    }
}

"Links internos verificados: $checked"
"Problemas: $($problems.Count)"
$problems | Sort-Object source, target -Unique | Format-Table -Wrap -AutoSize
if ($problems.Count) { exit 1 }
