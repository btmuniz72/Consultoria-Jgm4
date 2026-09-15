[CmdletBinding()]
param(
    [string]$SiteRoot = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)),
    [string]$BaseUrl = '',
    [string]$ReportsDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) 'reports')
)

$ErrorActionPreference = 'Stop'
$canonicalOrigin = 'https://www.jgm4consultoria.com.br'
$excludedDirectories = @(
    'archive', 'arquivo-morto', 'backup-identidade-jgm4', 'dados antgis jgm4', 'deploy', 'documentacao', 'ferramentas',
    'vendor', '.git', '.agents', '.claude', '.vscode', '.edge-test-profile'
)

function Get-AttributeValue {
    param([string]$Tag, [string]$Name)
    $match = [regex]::Match($Tag, '(?is)\b' + [regex]::Escape($Name) + '\s*=\s*(["''])(?<value>.*?)\1')
    if ($match.Success) { return [Net.WebUtility]::HtmlDecode($match.Groups['value'].Value.Trim()) }
    return ''
}

function Get-FirstMatch {
    param([string]$Content, [string]$Pattern)
    $match = [regex]::Match($Content, $Pattern, [Text.RegularExpressions.RegexOptions]::IgnoreCase -bor [Text.RegularExpressions.RegexOptions]::Singleline)
    if (-not $match.Success) { return '' }
    return [Net.WebUtility]::HtmlDecode(([regex]::Replace($match.Groups['value'].Value, '<[^>]+>', ' ') -replace '\s+', ' ').Trim())
}

function Convert-FileToUrl {
    param([string]$RelativePath)
    $webPath = $RelativePath.Replace('\', '/')
    if ($webPath -eq 'index.html') { return "$canonicalOrigin/" }
    if ($webPath.EndsWith('/index.html', [StringComparison]::OrdinalIgnoreCase)) {
        return "$canonicalOrigin/" + $webPath.Substring(0, $webPath.Length - 'index.html'.Length)
    }
    return "$canonicalOrigin/$webPath"
}

function Resolve-LocalReference {
    param([string]$SourceFile, [string]$Reference)
    if ([string]::IsNullOrWhiteSpace($Reference) -or $Reference.StartsWith('#') -or
        $Reference -match '^(?i)(mailto:|tel:|javascript:|data:|https?://|//)') { return $null }

    $clean = ($Reference -split '[?#]', 2)[0]
    if ([string]::IsNullOrWhiteSpace($clean)) { return $null }
    if ($clean.StartsWith('/')) {
        $candidate = Join-Path $SiteRoot $clean.TrimStart('/')
    } else {
        $candidate = Join-Path (Split-Path -Parent $SourceFile) $clean
    }
    try { return [IO.Path]::GetFullPath($candidate) } catch { return $candidate }
}

function Test-ExcludedPath {
    param([string]$RelativePath)
    $first = ($RelativePath.Replace('\', '/') -split '/')[0]
    return ($excludedDirectories -contains $first) -or
        $first -like 'backup-*' -or
        $first -like 'deploy-*' -or
        $first -like 'test-artifacts*'
}

$siteRootResolved = [IO.Path]::GetFullPath($SiteRoot)
$sitemapPath = Join-Path $siteRootResolved 'sitemap.xml'
$sitemapUrls = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
if (Test-Path -LiteralPath $sitemapPath) {
    [xml]$sitemapXml = Get-Content -LiteralPath $sitemapPath -Raw
    foreach ($loc in $sitemapXml.urlset.url.loc) { [void]$sitemapUrls.Add([string]$loc) }
}

$htmlFiles = @(
    Get-ChildItem -LiteralPath $siteRootResolved -Filter '*.html' -File
    Get-ChildItem -LiteralPath $siteRootResolved -Directory | Where-Object {
        -not (Test-ExcludedPath $_.Name)
    } | ForEach-Object {
        Get-ChildItem -LiteralPath $_.FullName -Filter '*.html' -File -Recurse
    }
) | Sort-Object FullName

$records = [Collections.Generic.List[object]]::new()
$knownFiles = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($file in $htmlFiles) { [void]$knownFiles.Add([IO.Path]::GetFullPath($file.FullName)) }

foreach ($file in $htmlFiles) {
    $relative = [IO.Path]::GetRelativePath($siteRootResolved, $file.FullName)
    $url = Convert-FileToUrl $relative
    $content = Get-Content -LiteralPath $file.FullName -Raw
    $title = Get-FirstMatch $content '<title\b[^>]*>(?<value>.*?)</title>'
    $descriptionTag = [regex]::Match($content, '(?is)<meta\b(?=[^>]*\bname\s*=\s*(["''])description\1)[^>]*>')
    $robotsTag = [regex]::Match($content, '(?is)<meta\b(?=[^>]*\bname\s*=\s*(["''])robots\1)[^>]*>')
    $canonicalTag = [regex]::Match($content, '(?is)<link\b(?=[^>]*\brel\s*=\s*(["''])canonical\1)[^>]*>')
    $description = if ($descriptionTag.Success) { Get-AttributeValue $descriptionTag.Value 'content' } else { '' }
    $robots = if ($robotsTag.Success) { Get-AttributeValue $robotsTag.Value 'content' } else { '' }
    $canonical = if ($canonicalTag.Success) { Get-AttributeValue $canonicalTag.Value 'href' } else { '' }
    $h1Matches = [regex]::Matches($content, '(?is)<h1\b[^>]*>(?<value>.*?)</h1>')
    $links = [Collections.Generic.List[string]]::new()
    $brokenLinks = [Collections.Generic.List[string]]::new()
    $brokenImages = [Collections.Generic.List[string]]::new()
    $missingAlt = 0

    foreach ($anchor in [regex]::Matches($content, '(?is)<a\b[^>]*>')) {
        $href = Get-AttributeValue $anchor.Value 'href'
        if ($href) { $links.Add($href) }
        $target = Resolve-LocalReference $file.FullName $href
        if ($target -and -not (Test-Path -LiteralPath $target)) {
            if (-not ([IO.Path]::GetExtension($target))) {
                $htmlTarget = "$target.html"
                if (Test-Path -LiteralPath $htmlTarget) { continue }
            }
            $brokenLinks.Add($href)
        }
    }

    foreach ($image in [regex]::Matches($content, '(?is)<img\b[^>]*>')) {
        $src = Get-AttributeValue $image.Value 'src'
        $altMatch = [regex]::Match($image.Value, '(?is)\balt\s*=')
        if (-not $altMatch.Success) { $missingAlt++ }
        $target = Resolve-LocalReference $file.FullName $src
        if ($target -and -not (Test-Path -LiteralPath $target)) { $brokenImages.Add($src) }
    }

    $visible = [regex]::Replace($content, '(?is)<script\b.*?</script>|<style\b.*?</style>|<[^>]+>', ' ')
    $wordCount = (($visible -replace '&[a-zA-Z#0-9]+;', ' ' -replace '\s+', ' ').Trim() -split '\s+' |
        Where-Object { $_ }).Count
    $indexable = $robots -notmatch '(?i)\bnoindex\b'
    $expectedCanonical = $url
    $issues = [Collections.Generic.List[string]]::new()
    if (-not $title) { $issues.Add('title ausente') }
    if (-not $description) { $issues.Add('description ausente') }
    if ($h1Matches.Count -ne 1) { $issues.Add("H1=$($h1Matches.Count)") }
    if ($indexable -and -not $canonical) { $issues.Add('canonical ausente') }
    if ($indexable -and $canonical -and $canonical -ne $expectedCanonical) { $issues.Add('canonical não autorreferente') }
    if ($indexable -and -not $sitemapUrls.Contains($url)) { $issues.Add('indexável fora do sitemap') }
    if (-not $indexable -and $sitemapUrls.Contains($url)) { $issues.Add('noindex no sitemap') }
    if ($brokenLinks.Count) { $issues.Add("links quebrados=$($brokenLinks.Count)") }
    if ($brokenImages.Count) { $issues.Add("imagens quebradas=$($brokenImages.Count)") }
    if ($missingAlt) { $issues.Add("imagens sem alt=$missingAlt") }
    if ($indexable -and $wordCount -lt 80) { $issues.Add("conteúdo curto=$wordCount palavras") }

    $httpStatus = $null
    $finalUrl = ''
    if ($BaseUrl) {
        $requestUrl = if ($relative -eq 'index.html') { $BaseUrl.TrimEnd('/') + '/' } else { $BaseUrl.TrimEnd('/') + '/' + $relative.Replace('\', '/') }
        try {
            $response = Invoke-WebRequest -Uri $requestUrl -Method Head -MaximumRedirection 0 -SkipHttpErrorCheck
            $httpStatus = [int]$response.StatusCode
            $finalUrl = [string]$response.Headers.Location
        } catch {
            $httpStatus = 0
            $issues.Add('falha na verificação HTTP')
        }
    }

    $records.Add([pscustomobject]@{
        Url = $url
        Arquivo = $relative.Replace('\', '/')
        Existe = $true
        StatusHttp = $httpStatus
        Titulo = $title
        Description = $description
        H1 = $h1Matches.Count
        Canonical = $canonical
        Robots = $robots
        Indexavel = $indexable
        Sitemap = $sitemapUrls.Contains($url)
        Palavras = $wordCount
        LinksInternos = $links.Count
        LinksQuebrados = ($brokenLinks -join ' | ')
        ImagensQuebradas = ($brokenImages -join ' | ')
        ImagensSemAlt = $missingAlt
        LinksRecebidos = 0
        Orfa = $false
        DestinoRedirect = $finalUrl
        Problemas = ($issues -join '; ')
    })
}

# Contagem de links recebidos entre HTMLs públicos.
$inbound = @{}
foreach ($record in $records) { $inbound[$record.Arquivo] = 0 }
foreach ($file in $htmlFiles) {
    $content = Get-Content -LiteralPath $file.FullName -Raw
    foreach ($anchor in [regex]::Matches($content, '(?is)<a\b[^>]*>')) {
        $target = Resolve-LocalReference $file.FullName (Get-AttributeValue $anchor.Value 'href')
        if ($target -and (Test-Path -LiteralPath $target -PathType Container)) {
            $target = Join-Path $target 'index.html'
        }
        if ($target -and $knownFiles.Contains($target)) {
            $rel = [IO.Path]::GetRelativePath($siteRootResolved, $target).Replace('\', '/')
            if ($inbound.ContainsKey($rel)) { $inbound[$rel]++ }
        }
    }
}
foreach ($record in $records) {
    $record.LinksRecebidos = $inbound[$record.Arquivo]
    $record.Orfa = $record.Indexavel -and $record.Arquivo -ne 'index.html' -and $record.LinksRecebidos -eq 0
    if ($record.Orfa) {
        $record.Problemas = (@($record.Problemas, 'página órfã') | Where-Object { $_ }) -join '; '
    }
}

# Duplicidades relevantes apenas entre páginas indexáveis.
$titleGroups = $records | Where-Object { $_.Indexavel -and $_.Titulo } | Group-Object Titulo | Where-Object Count -gt 1
$descriptionGroups = $records | Where-Object { $_.Indexavel -and $_.Description } | Group-Object Description | Where-Object Count -gt 1
foreach ($group in $titleGroups) {
    foreach ($record in $group.Group) { $record.Problemas = (@($record.Problemas, 'title duplicado') | Where-Object { $_ }) -join '; ' }
}
foreach ($group in $descriptionGroups) {
    foreach ($record in $group.Group) { $record.Problemas = (@($record.Problemas, 'description duplicada') | Where-Object { $_ }) -join '; ' }
}

$missingSitemapFiles = [Collections.Generic.List[string]]::new()
foreach ($sitemapUrl in $sitemapUrls) {
    $uri = [uri]$sitemapUrl
    $path = $uri.AbsolutePath.TrimStart('/')
    if (-not $path) { $path = 'index.html' }
    $local = Join-Path $siteRootResolved $path
    if (-not (Test-Path -LiteralPath $local)) { $missingSitemapFiles.Add($sitemapUrl) }
}

$summary = [ordered]@{
    GeneratedAt = (Get-Date).ToString('s')
    SiteRoot = $siteRootResolved
    TotalHtml = $records.Count
    Indexable = @($records | Where-Object Indexavel).Count
    Noindex = @($records | Where-Object { -not $_.Indexavel }).Count
    InSitemap = @($records | Where-Object Sitemap).Count
    WithIssues = @($records | Where-Object Problemas).Count
    Orphans = @($records | Where-Object Orfa).Count
    BrokenLinks = ($records | ForEach-Object { if ($_.LinksQuebrados) { ($_.LinksQuebrados -split ' \| ').Count } else { 0 } } | Measure-Object -Sum).Sum
    BrokenImages = ($records | ForEach-Object { if ($_.ImagensQuebradas) { ($_.ImagensQuebradas -split ' \| ').Count } else { 0 } } | Measure-Object -Sum).Sum
    DuplicateTitles = $titleGroups.Count
    DuplicateDescriptions = $descriptionGroups.Count
    SitemapUrlsWithoutLocalFile = $missingSitemapFiles.Count
}

New-Item -ItemType Directory -Path $ReportsDirectory -Force | Out-Null
$jsonOutput = [ordered]@{ summary = $summary; sitemapUrlsWithoutLocalFile = $missingSitemapFiles; pages = $records }
$jsonOutput | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $ReportsDirectory 'seo-audit.json') -Encoding utf8
$records | Export-Csv -LiteralPath (Join-Path $ReportsDirectory 'seo-audit.csv') -NoTypeInformation -Encoding utf8

$md = [Text.StringBuilder]::new()
[void]$md.AppendLine('# Auditoria SEO automatizada')
[void]$md.AppendLine()
[void]$md.AppendLine("Gerada em: $($summary.GeneratedAt)")
[void]$md.AppendLine()
[void]$md.AppendLine('## Resumo')
[void]$md.AppendLine()
foreach ($entry in $summary.GetEnumerator()) { [void]$md.AppendLine("- **$($entry.Key):** $($entry.Value)") }
[void]$md.AppendLine()
[void]$md.AppendLine('## Inventário')
[void]$md.AppendLine()
[void]$md.AppendLine('| URL | Sitemap | Indexável | H1 | Canonical | Links recebidos | Problemas |')
[void]$md.AppendLine('|---|---:|---:|---:|---|---:|---|')
foreach ($record in $records) {
    $safeTitle = $record.Canonical.Replace('|', '\|')
    $safeIssues = $record.Problemas.Replace('|', '\|')
    [void]$md.AppendLine("| $($record.Url) | $($record.Sitemap) | $($record.Indexavel) | $($record.H1) | $safeTitle | $($record.LinksRecebidos) | $safeIssues |")
}
if ($missingSitemapFiles.Count) {
    [void]$md.AppendLine()
    [void]$md.AppendLine('## URLs do sitemap sem arquivo local')
    [void]$md.AppendLine()
    foreach ($url in $missingSitemapFiles) { [void]$md.AppendLine("- $url") }
}
$md.ToString() | Set-Content -LiteralPath (Join-Path $ReportsDirectory 'seo-audit.md') -Encoding utf8

Write-Host "Auditoria concluída: $($records.Count) HTMLs; $($summary.WithIssues) com alertas."
Write-Host "Relatórios: $ReportsDirectory"
if ($summary.BrokenLinks -gt 0 -or $summary.BrokenImages -gt 0 -or $summary.SitemapUrlsWithoutLocalFile -gt 0) { exit 2 }
