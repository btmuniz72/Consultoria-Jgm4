param([string]$Path = (Join-Path (Get-Location) 'downloads\planilha-agendamento-docas-jgm4.xlsx'))

$ErrorActionPreference = 'Stop'
$resolved = (Resolve-Path -LiteralPath $Path).Path
$tempDir = Join-Path (Split-Path -Parent (Split-Path -Parent $resolved)) '.artifacts'
[IO.Directory]::CreateDirectory($tempDir) | Out-Null
$temp = Join-Path $tempDir 'planilha-agendamento-docas-jgm4-normalizacao.tmp.xlsx'
Copy-Item -LiteralPath $resolved -Destination $temp -Force

function Read-ZipText($zip, [string]$entryName) {
    $entry = $zip.GetEntry($entryName)
    if (-not $entry) { throw "Entrada ausente: $entryName" }
    $reader = [IO.StreamReader]::new($entry.Open())
    try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
}

function Write-ZipText($zip, [string]$entryName, [string]$content) {
    $existing = $zip.GetEntry($entryName)
    if ($existing) { $existing.Delete() }
    $entry = $zip.CreateEntry($entryName, [IO.Compression.CompressionLevel]::Optimal)
    $writer = [IO.StreamWriter]::new($entry.Open(), [Text.UTF8Encoding]::new($false))
    try { $writer.Write($content) } finally { $writer.Dispose() }
}

function Convert-SharedCellsToNumbers($xmlText, $sharedStrings, [string]$cellPattern) {
    [xml]$xml = $xmlText
    $ns = [Xml.XmlNamespaceManager]::new($xml.NameTable)
    $ns.AddNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
    foreach ($cell in $xml.SelectNodes('//x:c[@t="s"]', $ns)) {
        if ($cell.r -notmatch $cellPattern) { continue }
        $index = [int]$cell.v
        $value = $sharedStrings[$index]
        $number = $null
        if ($value -match '^\d{2}/\d{2}/\d{4}$') {
            $date = [datetime]::ParseExact($value, 'dd/MM/yyyy', [Globalization.CultureInfo]::InvariantCulture)
            $number = $date.ToOADate().ToString([Globalization.CultureInfo]::InvariantCulture)
        } elseif ($value -match '^\d{2}:\d{2}$') {
            $time = [TimeSpan]::ParseExact($value, 'hh\:mm', [Globalization.CultureInfo]::InvariantCulture)
            $number = $time.TotalDays.ToString('0.###############', [Globalization.CultureInfo]::InvariantCulture)
        }
        if ($null -ne $number) {
            [void]$cell.RemoveAttribute('t')
            $cell.v = $number
        }
    }
    $settings = [Xml.XmlWriterSettings]::new()
    $settings.Encoding = [Text.UTF8Encoding]::new($false)
    $settings.Indent = $false
    $settings.OmitXmlDeclaration = $false
    $memory = [IO.MemoryStream]::new()
    $writer = [Xml.XmlWriter]::Create($memory, $settings)
    $xml.Save($writer)
    $writer.Dispose()
    $result = [Text.Encoding]::UTF8.GetString($memory.ToArray())
    $memory.Dispose()
    return $result
}

$zip = [IO.Compression.ZipFile]::Open($temp, [IO.Compression.ZipArchiveMode]::Update)
try {
    [xml]$sharedXml = Read-ZipText $zip 'xl/sharedStrings.xml'
    $sharedNs = [Xml.XmlNamespaceManager]::new($sharedXml.NameTable)
    $sharedNs.AddNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
    $sharedStrings = @($sharedXml.SelectNodes('//x:si', $sharedNs) | ForEach-Object {
        (@($_.SelectNodes('.//x:t', $sharedNs) | ForEach-Object { $_.InnerText }) -join '')
    })
    $agenda = Convert-SharedCellsToNumbers (Read-ZipText $zip 'xl/worksheets/sheet2.xml') $sharedStrings '^(B|C|P|Q|R)[2-9]$'
    $dashboard = Convert-SharedCellsToNumbers (Read-ZipText $zip 'xl/worksheets/sheet5.xml') $sharedStrings '^V[3-9]$'
    Write-ZipText $zip 'xl/worksheets/sheet2.xml' $agenda
    Write-ZipText $zip 'xl/worksheets/sheet5.xml' $dashboard
} finally {
    $zip.Dispose()
}

# Lê integralmente todas as entradas para detectar pacote corrompido.
$check = [IO.Compression.ZipFile]::OpenRead($temp)
try {
    foreach ($entry in $check.Entries) {
        $stream = $entry.Open()
        try {
            $buffer = [byte[]]::new(8192)
            while ($stream.Read($buffer, 0, $buffer.Length) -gt 0) { }
        } finally { $stream.Dispose() }
    }
    $sheet2 = Read-ZipText $check 'xl/worksheets/sheet2.xml'
    $sheet5 = Read-ZipText $check 'xl/worksheets/sheet5.xml'
    if ($sheet2 -match '<c r="B2"[^>]* t="s"' -or $sheet2 -match '<c r="C2"[^>]* t="s"') { throw 'Datas ou horários demonstrativos permaneceram como texto.' }
    if ($sheet5 -match '<c r="V3"[^>]* t="s"') { throw 'Datas auxiliares do Dashboard permaneceram como texto.' }
} finally { $check.Dispose() }

Copy-Item -LiteralPath $temp -Destination $resolved -Force
Remove-Item -LiteralPath $temp -Force
Get-Item -LiteralPath $resolved | Select-Object FullName, Length, LastWriteTime
