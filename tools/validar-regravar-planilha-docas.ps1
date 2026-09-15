param([string]$Path = (Join-Path (Get-Location) 'downloads\planilha-agendamento-docas-jgm4.xlsx'))

$ErrorActionPreference = 'Stop'
$resolved = (Resolve-Path -LiteralPath $Path).Path
$backupDir = Join-Path (Split-Path -Parent (Split-Path -Parent $resolved)) '.artifacts'
[IO.Directory]::CreateDirectory($backupDir) | Out-Null
Copy-Item -LiteralPath $resolved -Destination (Join-Path $backupDir 'planilha-agendamento-docas-antes-regravacao.xlsx') -Force

$excel = $null
$book = $null
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $excel.AskToUpdateLinks = $false
    $book = $excel.Workbooks.Open($resolved, 0, $false)
    $required = @('Instruções','Agenda','Cadastros','Indicadores','Dashboard')
    $actual = @($book.Worksheets | ForEach-Object { $_.Name })
    foreach ($name in $required) { if ($actual -notcontains $name) { throw "Aba ausente: $name" } }
    $agenda = $book.Worksheets.Item('Agenda')
    if ($agenda.ListObjects.Count -ne 1) { throw 'Tabela principal da Agenda ausente.' }
    if ($agenda.Range('S2').Formula -notlike '=IF*') { throw 'Fórmula de atraso ausente.' }
    if ($agenda.Range('O2').Validation.Type -ne 3) { throw 'Validação de status ausente.' }
    if ($book.Worksheets.Item('Dashboard').ChartObjects().Count -ne 3) { throw 'Quantidade inesperada de gráficos.' }
    $excel.CalculateFull()
    $book.Save()
    $book.Close($true)
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($book)
    $book = $null

    $check = $excel.Workbooks.Open($resolved, 0, $true)
    if ($check.FileFormat -ne 51) { throw "Formato inesperado após reabertura: $($check.FileFormat)" }
    if ($check.Worksheets.Count -ne 5) { throw 'Quantidade inesperada de abas após reabertura.' }
    if ($check.Worksheets.Item('Indicadores').Range('B15').Formula -notmatch 'SUMPRODUCT') { throw 'Fórmula compatível de cargas por dia ausente.' }
    $check.Close($false)
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($check)
    $info = Get-Item -LiteralPath $resolved
    Write-Output "EXCEL_OK|$($info.Length)|$($required -join ',')"
} finally {
    if ($null -ne $book) { try { $book.Close($false) } catch {} }
    if ($null -ne $excel) { try { $excel.Quit() } catch {}; [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
    [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
