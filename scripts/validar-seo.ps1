param(
    [string]$SiteRoot = (Split-Path -Parent $PSScriptRoot),
    [switch]$Json
)

$ErrorActionPreference = 'Stop'
$canonicalHost = 'www.jgm4consultoria.com.br'
$sitemapPath = Join-Path $SiteRoot 'sitemap.xml'

function Get-FirstMatch {
    param([string]$Content, [string]$Pattern)
    $match = [regex]::Match($Content, $Pattern, [Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($match.Success) { return [Net.WebUtility]::HtmlDecode($match.Groups[1].Value.Trim()) }
    return $null
}

function Convert-UrlToFile {
    param([uri]$Url)
    if ($Url.AbsolutePath -eq '/') { return Join-Path $SiteRoot 'index.html' }
    $relative = [Uri]::UnescapeDataString($Url.AbsolutePath.TrimStart('/')).Replace('/', [IO.Path]::DirectorySeparatorChar)
    if ($Url.AbsolutePath.EndsWith('/')) {
        return Join-Path (Join-Path $SiteRoot $relative) 'index.html'
    }
    return Join-Path $SiteRoot $relative
}

[xml]$sitemap = Get-Content -Raw -LiteralPath $sitemapPath
$namespace = New-Object Xml.XmlNamespaceManager($sitemap.NameTable)
$namespace.AddNamespace('sm', 'http://www.sitemaps.org/schemas/sitemap/0.9')
$locations = @($sitemap.SelectNodes('//sm:url/sm:loc', $namespace) | ForEach-Object { $_.InnerText.Trim() })

$records = foreach ($location in $locations) {
    $uri = [uri]$location
    $file = Convert-UrlToFile $uri
    $exists = Test-Path -LiteralPath $file -PathType Leaf
    $content = if ($exists) { Get-Content -Raw -LiteralPath $file } else { '' }
    $title = Get-FirstMatch $content '<title[^>]*>([\s\S]*?)</title>'
    $description = Get-FirstMatch $content '<meta[^>]+name=["'']description["''][^>]+content=["'']([^"'']*)["'']'
    if (-not $description) {
        $description = Get-FirstMatch $content '<meta[^>]+content=["'']([^"'']*)["''][^>]+name=["'']description["'']'
    }
    $canonical = Get-FirstMatch $content '<link[^>]+rel=["'']canonical["''][^>]+href=["'']([^"'']+)["'']'
    if (-not $canonical) {
        $canonical = Get-FirstMatch $content '<link[^>]+href=["'']([^"'']+)["''][^>]+rel=["'']canonical["'']'
    }
    $robots = Get-FirstMatch $content '<meta[^>]+name=["'']robots["''][^>]+content=["'']([^"'']*)["'']'
    $htmlLang = Get-FirstMatch $content '<html[^>]+lang=["'']([^"'']+)["'']'
    $h1 = Get-FirstMatch $content '<h1[^>]*>([\s\S]*?)</h1>'
    if ($h1) { $h1 = [regex]::Replace($h1, '<[^>]+>', ' ').Trim() }
    $h1Count = [regex]::Matches($content, '<h1(?:\s|>)', 'IgnoreCase').Count
    $canonicalCount = [regex]::Matches($content, '<link[^>]+rel=["'']canonical["'']', 'IgnoreCase').Count
    $mojibake = [regex]::IsMatch($content, 'Ã[¡-¿]|Â[^\s]|â€[“”™¦]|â€“|â€”|�')

    [pscustomobject]@{
        url = $location
        file = $file.Substring($SiteRoot.Length).TrimStart('\', '/')
        exists = $exists
        host_ok = ($uri.Scheme -eq 'https' -and $uri.Host -eq $canonicalHost)
        title = $title
        title_length = if ($title) { $title.Length } else { 0 }
        description = $description
        description_length = if ($description) { $description.Length } else { 0 }
        canonical = $canonical
        canonical_ok = ($canonical -eq $location)
        canonical_count = $canonicalCount
        robots = $robots
        noindex = ($robots -match 'noindex')
        lang = $htmlLang
        h1 = $h1
        h1_count = $h1Count
        mojibake = $mojibake
    }
}

$duplicateTitles = @($records | Where-Object title | Group-Object title | Where-Object Count -gt 1)
$duplicateDescriptions = @($records | Where-Object description | Group-Object description | Where-Object Count -gt 1)
$problems = @($records | Where-Object {
    -not $_.exists -or -not $_.host_ok -or -not $_.title -or -not $_.description -or
    -not $_.canonical_ok -or $_.canonical_count -ne 1 -or $_.noindex -or
    -not $_.lang -or $_.h1_count -ne 1 -or $_.mojibake
})

$result = [pscustomobject]@{
    total_urls = $records.Count
    duplicate_urls = @($locations | Group-Object | Where-Object Count -gt 1 | ForEach-Object Name)
    duplicate_titles = @($duplicateTitles | ForEach-Object {
        [pscustomobject]@{ value = $_.Name; urls = @($_.Group.url) }
    })
    duplicate_descriptions = @($duplicateDescriptions | ForEach-Object {
        [pscustomobject]@{ value = $_.Name; urls = @($_.Group.url) }
    })
    problem_count = $problems.Count
    problems = $problems
    pages = $records
}

if ($Json) {
    $result | ConvertTo-Json -Depth 6
} else {
    "URLs no sitemap: $($records.Count)"
    "URLs duplicadas: $($result.duplicate_urls.Count)"
    "Titles duplicados: $($duplicateTitles.Count)"
    "Descriptions duplicadas: $($duplicateDescriptions.Count)"
    "Páginas com problema: $($problems.Count)"
    $problems | Format-Table file, exists, canonical_ok, canonical_count, noindex, lang, h1_count, mojibake -AutoSize
}
