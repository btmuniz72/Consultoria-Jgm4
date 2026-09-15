[CmdletBinding()]
param(
    [string]$SiteRoot = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
)

$ErrorActionPreference = 'Stop'
$utf8NoBom = [Text.UTF8Encoding]::new($false)
$siteRootPath = (Resolve-Path -LiteralPath $SiteRoot).Path
$htmlRoots = @(
    (Join-Path $siteRootPath '404.html'),
    (Join-Path $siteRootPath 'index.html'),
    (Join-Path $siteRootPath 'index-en.html'),
    (Join-Path $siteRootPath 'index-es.html')
)

foreach ($directory in @('blog', 'pages', 'consultor-logistico', 'consultoria-logistica-para-pequenas-empresas')) {
    $htmlRoots += Get-ChildItem -LiteralPath (Join-Path $siteRootPath $directory) -Recurse -Filter '*.html' -File |
        ForEach-Object { $_.FullName }
}

$headBlock = @'
  <link rel="stylesheet" href="/css/brand.css">
  <link rel="icon" href="/assets/brand/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" sizes="48x48" href="/assets/brand/favicon-48x48.png">
  <link rel="icon" type="image/png" sizes="96x96" href="/assets/brand/favicon-96x96.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/assets/brand/favicon-192x192.png">
  <link rel="icon" type="image/png" sizes="512x512" href="/assets/brand/favicon-512x512.png">
  <link rel="apple-touch-icon" sizes="192x192" href="/assets/brand/favicon-192x192.png">
  <link rel="manifest" href="/site.webmanifest">
  <meta property="og:image" content="https://www.jgm4consultoria.com.br/assets/brand/og-jgm4-1200x630.jpg">
  <meta property="og:image:secure_url" content="https://www.jgm4consultoria.com.br/assets/brand/og-jgm4-1200x630.jpg">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="JGM4 Consultoria Logística">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="https://www.jgm4consultoria.com.br/assets/brand/og-jgm4-1200x630.jpg">
  <meta name="twitter:image:alt" content="JGM4 Consultoria Logística">
'@

function Remove-HeadTag {
    param([string]$Content, [string]$Pattern)
    return [regex]::Replace(
        $Content,
        $Pattern,
        '',
        [Text.RegularExpressions.RegexOptions]::IgnoreCase -bor
        [Text.RegularExpressions.RegexOptions]::Singleline
    )
}

function Get-Attribute {
    param([string]$Tag, [string]$Name)
    $match = [regex]::Match(
        $Tag,
        '\b' + [regex]::Escape($Name) + '\s*=\s*(["''])(?<value>.*?)\1',
        [Text.RegularExpressions.RegexOptions]::IgnoreCase -bor
        [Text.RegularExpressions.RegexOptions]::Singleline
    )
    if ($match.Success) { return $match.Groups['value'].Value }
    return ''
}

function Escape-Attribute {
    param([string]$Value)
    return [Net.WebUtility]::HtmlEncode($Value)
}

function New-LogoPicture {
    param(
        [string]$OriginalTag,
        [ValidateSet('header', 'footer', 'square')]
        [string]$Kind
    )

    $classes = (Get-Attribute -Tag $OriginalTag -Name 'class').Trim()
    $alt = (Get-Attribute -Tag $OriginalTag -Name 'alt').Trim()
    if (-not $alt -or $alt -notmatch 'JGM4') { $alt = 'JGM4 Consultoria Logística' }
    $classValue = (($classes + ' brand-logo').Trim() -replace '\s+', ' ')
    $safeAlt = Escape-Attribute $alt
    $safeClass = Escape-Attribute $classValue

    if ($Kind -eq 'footer') {
        return '<picture class="brand-logo-picture brand-logo-picture-footer">' +
            '<img src="/assets/brand/logo-jgm4-compacta-nova.png" alt="JGM4 Consultoria Logística"' +
            ' class="' + $safeClass + '" width="1024" height="1024" loading="lazy" decoding="async">' +
            '</picture>'
    }

    if ($Kind -eq 'square') {
        return '<picture class="brand-logo-picture brand-logo-picture-square">' +
            '<img src="/assets/brand/logo-jgm4-compacta-nova.png" alt="JGM4 Consultoria Logística"' +
            ' class="' + $safeClass + '" width="1024" height="1024" decoding="async">' +
            '</picture>'
    }

    return '<picture class="brand-logo-picture brand-logo-picture-header">' +
        '<source media="(max-width: 768px)" srcset="/assets/brand/logo-jgm4-compacta-nova.png" type="image/png">' +
        '<img src="/assets/brand/logo-jgm4-horizontal-nova.png" alt="JGM4 Consultoria Logística"' +
        ' class="' + $safeClass + '" width="1536" height="1024" decoding="async">' +
        '</picture>'
}

$changed = 0
$logos = 0

foreach ($path in ($htmlRoots | Sort-Object -Unique)) {
    $content = [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8)
    $original = $content

    $content = Remove-HeadTag $content '(?is)\s*<link\b(?=[^>]*\brel\s*=\s*(["''])[^"'']*\b(?:shortcut\s+icon|icon|apple-touch-icon)\b[^"'']*\1)[^>]*>'
    $content = Remove-HeadTag $content '(?is)\s*<link\b(?=[^>]*\brel\s*=\s*(["''])manifest\1)[^>]*>'
    $content = Remove-HeadTag $content '(?is)\s*<link\b(?=[^>]*\bhref\s*=\s*(["''])/css/brand\.css\1)[^>]*>'

    foreach ($metaName in @('og:image', 'og:image:secure_url', 'og:image:type', 'og:image:width', 'og:image:height', 'og:image:alt', 'twitter:card', 'twitter:image', 'twitter:image:alt')) {
        $escaped = [regex]::Escape($metaName)
        $content = Remove-HeadTag $content ('(?is)\s*<meta\b(?=[^>]*\b(?:property|name)\s*=\s*(["''])' + $escaped + '\1)[^>]*>')
    }

    if ($content -notmatch '(?i)</head>') {
        throw "Elemento </head> ausente em $path"
    }
    $content = [regex]::Replace($content, '(?i)</head>', "`r`n$headBlock</head>", 1)

    foreach ($kind in @('header', 'footer', 'square')) {
        $picturePattern = '(?is)<picture\b(?=[^>]*\bbrand-logo-picture-' + $kind + '\b)[^>]*>.*?</picture>'
        $content = [regex]::Replace($content, $picturePattern, {
            param($match)
            $imageMatch = [regex]::Match($match.Value, '(?is)<img\b[^>]*>')
            if (-not $imageMatch.Success) { return $match.Value }
            return New-LogoPicture -OriginalTag $imageMatch.Value -Kind $kind
        })
    }

    $logoPattern = '(?is)<img\b(?=[^>]*\bsrc\s*=\s*(["''])[^"'']*logojgm4\.png\1)[^>]*>'
    $contentSnapshot = $content
    $content = [regex]::Replace($content, $logoPattern, {
        param($match)
        $before = $contentSnapshot.Substring(0, $match.Index)
        $inHeader = $before.LastIndexOf('<header', [StringComparison]::OrdinalIgnoreCase) -gt
            $before.LastIndexOf('</header', [StringComparison]::OrdinalIgnoreCase)
        $inFooter = $before.LastIndexOf('<footer', [StringComparison]::OrdinalIgnoreCase) -gt
            $before.LastIndexOf('</footer', [StringComparison]::OrdinalIgnoreCase)
        $kind = if ($inFooter) { 'footer' } elseif ($inHeader) { 'header' } else { 'square' }
        $script:logos++
        return New-LogoPicture -OriginalTag $match.Value -Kind $kind
    })
    $content = [regex]::Replace(
        $content,
        '(?is)(<picture\b[^>]*brand-logo-picture-square[^>]*>.*?<img\b[^>]*?)\s+loading\s*=\s*(["''])lazy\2',
        '$1'
    )

    $content = $content -replace '(?i)("image"\s*:\s*")https?://(?:www\.)?jgm4consultoria\.com\.br/assets/brand/logo-jgm4-quadrada-512x512\.png(")', '$1https://www.jgm4consultoria.com.br/assets/brand/og-jgm4-1200x630.jpg$2'
    $content = $content -replace 'https?://(?:www\.)?jgm4consultoria\.com\.br/assets/(?:brand/)?(?:logojgm4|logo-jgm4-quadrada-512x512|logo-jgm4-quadrada-ads-1200x1200)\.(?:png|webp)', 'https://www.jgm4consultoria.com.br/assets/brand/logo-jgm4-google-ads-1200x1200.png'
    $content = $content -replace '(?<![\w.-])(?:\.\.?/|/)assets/(?:brand/)?(?:logojgm4|logo-jgm4-quadrada-512x512|logo-jgm4-quadrada-ads-1200x1200)\.(?:png|webp)', '/assets/brand/logo-jgm4-compacta-nova.png'

    if ($content -ne $original) {
        [IO.File]::WriteAllText($path, $content, $utf8NoBom)
        $changed++
    }
}

$jsPath = Join-Path $siteRootPath 'js\blog-list.js'
$js = [IO.File]::ReadAllText($jsPath, [Text.Encoding]::UTF8)
$updatedJs = $js -replace 'https?://(?:www\.)?jgm4consultoria\.com\.br/assets/(?:brand/)?(?:logojgm4|logo-jgm4-quadrada-512x512|logo-jgm4-quadrada-ads-1200x1200)\.(?:png|webp)', 'https://www.jgm4consultoria.com.br/assets/brand/logo-jgm4-google-ads-1200x1200.png'
if ($updatedJs -ne $js) {
    [IO.File]::WriteAllText($jsPath, $updatedJs, $utf8NoBom)
}

[pscustomobject]@{
    HtmlChanged = $changed
    LogosReplaced = $logos
    BlogListChanged = ($updatedJs -ne $js)
}
