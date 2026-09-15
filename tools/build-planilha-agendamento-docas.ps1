param(
    [string]$Workspace = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'
$outputDir = Join-Path $Workspace 'downloads'
$previewDir = Join-Path $Workspace '.artifacts\planilha-docas-previews'
$outputPath = Join-Path $outputDir 'planilha-agendamento-docas-jgm4.xlsx'
New-Item -ItemType Directory -Force -Path $outputDir, $previewDir | Out-Null

$excel = $null
$workbook = $null
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $excel.ScreenUpdating = $false
    try { $excel.Calculation = -4105 } catch { }
    $workbook = $excel.Workbooks.Add()

    while ($workbook.Worksheets.Count -lt 5) { [void]$workbook.Worksheets.Add() }
    while ($workbook.Worksheets.Count -gt 5) { $workbook.Worksheets.Item($workbook.Worksheets.Count).Delete() }
    $sheetNames = @('Instruções', 'Agenda', 'Cadastros', 'Indicadores', 'Dashboard')
    for ($i = 1; $i -le 5; $i++) { $workbook.Worksheets.Item($i).Name = $sheetNames[$i - 1] }

    $navy = 0x342208
    $green = 0x389207
    $lightGreen = 0xE5F4E8
    $pale = 0xF4F8F5
    $line = 0xDDD8D2
    $white = 0xFFFFFF
    $muted = 0x74624F
    $warning = 0xD9EBFF
    $danger = 0xD9E2FF
    $success = 0xDEF1E2
    $gray = 0xE7E7E7

    function Set-TitleBand($sheet, $rangeAddress, $text) {
        $range = $sheet.Range($rangeAddress)
        $range.Merge()
        $range.Value2 = $text
        $range.Interior.Color = $navy
        $range.Font.Color = $white
        $range.Font.Bold = $true
        $range.Font.Size = 20
        $range.HorizontalAlignment = -4131
        $range.VerticalAlignment = -4108
        $range.RowHeight = 34
    }

    function Set-Section($sheet, $rangeAddress, $text) {
        $range = $sheet.Range($rangeAddress)
        $range.Merge()
        $range.Value2 = $text
        $range.Interior.Color = $green
        $range.Font.Color = $white
        $range.Font.Bold = $true
        $range.Font.Size = 12
        $range.RowHeight = 24
    }

    function Add-Table($sheet, $address, $name, $style = 'TableStyleMedium4') {
        $table = $sheet.ListObjects.Add(1, $sheet.Range($address), $null, 1)
        $table.Name = $name
        $table.TableStyle = $style
        $table.ShowAutoFilter = $true
        return $table
    }

    function Set-RowValues($sheet, [int]$rowNumber, [int]$startColumn, $values) {
        for ($index = 0; $index -lt $values.Count; $index++) {
            if ($null -ne $values[$index]) {
                $value = $values[$index]
                if ($value -is [datetime]) { $value = $value.ToString('dd/MM/yyyy') }
                $targetColumn = $startColumn + $index
                if (($value -is [double]) -and ($targetColumn -in @(3,16,17,18))) {
                    $value = [TimeSpan]::FromDays($value).ToString('hh\:mm')
                }
                elseif ($value -is [ValueType]) { $value = [string]$value }
                try {
                    $sheet.Cells.Item($rowNumber, $targetColumn).Value2 = $value
                } catch {
                    throw "Falha ao gravar linha $rowNumber, coluna $targetColumn, valor '$value' ($($value.GetType().FullName)): $($_.Exception.Message)"
                }
            }
        }
    }

    # Instruções
    $ws = $workbook.Worksheets.Item('Instruções')
    $ws.DisplayPageBreaks = $false
    $excel.ActiveWindow.DisplayGridlines = $false
    Set-TitleBand $ws 'A1:H2' 'Planilha Gratuita de Agendamento de Docas'
    $ws.Range('A3:H3').Merge()
    $ws.Range('A3').Value2 = 'JGM4 Consultoria Logística'
    $ws.Range('A3').Font.Size = 12
    $ws.Range('A3').Font.Bold = $true
    $ws.Range('A3').Font.Color = $green
    $ws.Range('A3').RowHeight = 24
    $ws.Range('A5:H6').Merge()
    $ws.Range('A5').Value2 = 'Use este modelo para organizar recebimentos, fornecedores, transportadoras, docas, horários, atrasos, no-show e tempos operacionais. A planilha foi pensada para operações pequenas e médias e pode ser adaptada livremente.'
    $ws.Range('A5').WrapText = $true
    $ws.Range('A5').Interior.Color = $pale
    $ws.Range('A5').Font.Size = 11
    $ws.Range('A5').RowHeight = 46

    Set-Section $ws 'A8:H8' 'COMO COMEÇAR'
    $instructions = @(
        @('1', 'Cadastre a operação', 'Na aba Cadastros, substitua os exemplos de docas, fornecedores, transportadoras e tipos de carga.'),
        @('2', 'Exclua os exemplos', 'Na aba Agenda, as linhas com ID “EXEMPLO-...” são demonstrativas. Exclua o conteúdo das linhas 2 a 9 antes do uso real; preserve as fórmulas nas colunas S a V.'),
        @('3', 'Preencha a agenda', 'Informe data, horário previsto, doca, parceiro, carga, veículo e status. Use um ID único para cada agendamento.'),
        @('4', 'Atualize os horários reais', 'Registre chegada, início e fim do atendimento. Atraso, espera e atendimento são calculados automaticamente em minutos.'),
        @('5', 'Registre no-show', 'Selecione o status “No-show”. A coluna No-show será preenchida automaticamente com “Sim”.'),
        @('6', 'Acompanhe os indicadores', 'As abas Indicadores e Dashboard resumem volume, conclusão, no-show, cancelamento, reagendamento e tempos médios.')
    )
    $row = 10
    foreach ($item in $instructions) {
        $ws.Range("A$row").Value2 = $item[0]
        $ws.Range("B$row:C$row").Merge()
        $ws.Range("B$row").Value2 = $item[1]
        $ws.Range("D$row:H$row").Merge()
        $ws.Range("D$row").Value2 = $item[2]
        $ws.Range("A$row:H$row").RowHeight = 42
        $ws.Range("A$row:H$row").VerticalAlignment = -4108
        $ws.Range("A$row:H$row").Borders.Color = $line
        $ws.Range("A$row").HorizontalAlignment = -4108
        $ws.Range("A$row").Font.Bold = $true
        $ws.Range("A$row").Font.Color = $green
        $ws.Range("B$row").Font.Bold = $true
        $ws.Range("D$row").WrapText = $true
        $row++
    }
    Set-Section $ws 'A18:H18' 'SIGNIFICADO DOS STATUS'
    $statusHelp = @(
        @('Agendado', 'Horário reservado, ainda sem confirmação final.'),
        @('Confirmado', 'Agendamento validado com o parceiro.'),
        @('Em espera', 'Veículo chegou e aguarda início.'),
        @('Em atendimento', 'Carga ou descarga em execução.'),
        @('Concluído', 'Atendimento encerrado.'),
        @('Reagendado', 'Movido para outra data ou horário.'),
        @('Cancelado', 'Agendamento cancelado antes do atendimento.'),
        @('No-show', 'Veículo não compareceu à janela reservada.')
    )
    $row = 20
    foreach ($item in $statusHelp) {
        $ws.Range("A$row:B$row").Merge(); $ws.Range("A$row").Value2 = $item[0]
        $ws.Range("C$row:H$row").Merge(); $ws.Range("C$row").Value2 = $item[1]
        $ws.Range("A$row:H$row").Borders.Color = $line
        $ws.Range("A$row").Font.Bold = $true
        $row++
    }
    Set-Section $ws 'A30:H30' 'INTERPRETAÇÃO DOS INDICADORES'
    $ws.Range('A32:H35').Merge()
    $ws.Range('A32').Value2 = 'Use os indicadores como tendência da sua própria operação. Não existe meta universal para pontualidade, espera, atendimento ou ocupação. Compare períodos equivalentes, investigue causas e segmente por doca, fornecedor e tipo de carga antes de tomar decisões.'
    $ws.Range('A32').WrapText = $true
    $ws.Range('A32').VerticalAlignment = -4160
    $ws.Range('A32').Interior.Color = $pale
    $ws.Range('A32').RowHeight = 70
    $ws.Range('A37:H39').Merge()
    $ws.Range('A37').Value2 = "Sua operação cresceu além da planilha?`nConheça o Doca Certa — sistema de agendamento e gestão de docas.`ndocacerta.com.br"
    $ws.Range('A37').WrapText = $true
    $ws.Range('A37').Interior.Color = $navy
    $ws.Range('A37').Font.Color = $white
    $ws.Range('A37').Font.Bold = $true
    $ws.Range('A37').Font.Size = 12
    $ws.Range('A37').RowHeight = 62
    [void]$ws.Hyperlinks.Add($ws.Range('A37'), 'https://docacerta.com.br', '', 'Conheça o Doca Certa', $ws.Range('A37').Value2)
    $ws.Columns('A').ColumnWidth = 6
    $ws.Columns('B:C').ColumnWidth = 14
    $ws.Columns('D:H').ColumnWidth = 15
    $ws.Range('A1:H39').Font.Name = 'Aptos'
    $ws.Range('A1:H39').Font.Color = $navy
    $ws.Range('A37:H39').Font.Color = $white
    $ws.Range('A1:H39').VerticalAlignment = -4108
    $ws.Range('A5:H39').HorizontalAlignment = -4131
    $ws.PageSetup.PrintArea = '$A$1:$H$39'
    $ws.PageSetup.Orientation = 1
    $ws.PageSetup.Zoom = $false
    $ws.PageSetup.FitToPagesWide = 1
    $ws.PageSetup.FitToPagesTall = 1

    # Cadastros primeiro, para alimentar validações.
    $ws = $workbook.Worksheets.Item('Cadastros')
    Set-TitleBand $ws 'A1:N2' 'Cadastros da Operação'
    $ws.Range('A3:N3').Merge(); $ws.Range('A3').Value2 = 'Substitua os exemplos pelos dados reais. As listas alimentam os campos da aba Agenda.'
    $ws.Range('A3').Font.Color = $muted
    $ws.Range('A3').RowHeight = 24
    Set-Section $ws 'A5:B5' 'DOCAS'
    $ws.Range('A6').Value2 = 'Doca 01'; $ws.Range('A7').Value2 = 'Doca 02'; $ws.Range('A8').Value2 = 'Doca 03'
    Set-Section $ws 'D5:I5' 'FORNECEDORES'
    Set-RowValues $ws 6 4 @('Fornecedor','CNPJ','Contato','Telefone','E-mail','Observação')
    $suppliers = @(
        @('Fornecedor Alfa','00.000.000/0001-01','Ana Lima','(11) 90000-0001','ana@exemplo.com','EXEMPLO'),
        @('Fornecedor Beta','00.000.000/0001-02','Carlos Melo','(11) 90000-0002','carlos@exemplo.com','EXEMPLO'),
        @('Fornecedor Gama','00.000.000/0001-03','Paula Reis','(11) 90000-0003','paula@exemplo.com','EXEMPLO')
    )
    for ($i=0; $i -lt $suppliers.Count; $i++) { Set-RowValues $ws ($i+7) 4 $suppliers[$i] }
    Set-Section $ws 'K5:N5' 'TRANSPORTADORAS'
    Set-RowValues $ws 6 11 @('Transportadora','Contato','Telefone','E-mail')
    $carriers = @(
        @('Transportadora Rota','João Alves','(11) 91111-0001','joao@exemplo.com'),
        @('Transportadora Via','Marina Luz','(11) 91111-0002','marina@exemplo.com'),
        @('Transportadora Sul','Rui Costa','(11) 91111-0003','rui@exemplo.com')
    )
    for ($i=0; $i -lt $carriers.Count; $i++) { Set-RowValues $ws ($i+7) 11 $carriers[$i] }
    Set-Section $ws 'A12:B12' 'TIPOS DE CARGA'
    $types = @('Paletizada','Batida','Granel','Contêiner','Devolução','Outros')
    for ($i=0; $i -lt $types.Count; $i++) { $ws.Cells.Item($i+13,1).Value2 = $types[$i] }
    Set-Section $ws 'D12:E12' 'UNIDADES'
    $units = @('Paletes','Caixas','Unidades','Quilos','Toneladas','Litros')
    for ($i=0; $i -lt $units.Count; $i++) { $ws.Cells.Item($i+13,4).Value2 = $units[$i] }
    Set-Section $ws 'G12:H12' 'STATUS'
    $statuses = @('Agendado','Confirmado','Em espera','Em atendimento','Concluído','Reagendado','Cancelado','No-show')
    for ($i=0; $i -lt $statuses.Count; $i++) { $ws.Cells.Item($i+13,7).Value2 = $statuses[$i] }
    $ws.Range('D6:I6').Interior.Color = $lightGreen; $ws.Range('D6:I6').Font.Bold = $true
    $ws.Range('K6:N6').Interior.Color = $lightGreen; $ws.Range('K6:N6').Font.Bold = $true
    $ws.Range('A1:N22').Font.Name = 'Aptos'
    $ws.Range('A5:N22').Borders.Color = $line
    $ws.Columns('A:B').ColumnWidth = 18
    $ws.Columns('C').ColumnWidth = 3
    $ws.Columns('D:I').ColumnWidth = 18
    $ws.Columns('J').ColumnWidth = 3
    $ws.Columns('K:N').ColumnWidth = 19
    $ws.Columns('I').ColumnWidth = 23
    $ws.Columns('N').ColumnWidth = 24
    [void](Add-Table $ws 'D6:I106' 'TabelaFornecedores' 'TableStyleMedium4')
    [void](Add-Table $ws 'K6:N106' 'TabelaTransportadoras' 'TableStyleMedium4')
    [void]$workbook.Names.Add('ListaDocas', "=Cadastros!`$A`$6:`$A`$105")
    [void]$workbook.Names.Add('ListaFornecedores', "=Cadastros!`$D`$7:`$D`$106")
    [void]$workbook.Names.Add('ListaTransportadoras', "=Cadastros!`$K`$7:`$K`$106")
    [void]$workbook.Names.Add('ListaTiposCarga', "=Cadastros!`$A`$13:`$A`$30")
    [void]$workbook.Names.Add('ListaUnidades', "=Cadastros!`$D`$13:`$D`$30")
    [void]$workbook.Names.Add('ListaStatus', "=Cadastros!`$G`$13:`$G`$20")
    $ws.Activate(); $excel.ActiveWindow.SplitRow = 5; $excel.ActiveWindow.FreezePanes = $true; $excel.ActiveWindow.DisplayGridlines = $false

    # Agenda
    $ws = $workbook.Worksheets.Item('Agenda')
    $headers = @('ID','Data','Horário Previsto','Doca','Fornecedor','Transportadora','Pedido','Nota Fiscal','Tipo de Carga','Quantidade','Unidade','Placa','Motorista','Telefone','Status','Horário de Chegada','Início do Atendimento','Fim do Atendimento','Atraso (min)','Tempo de Espera (min)','Tempo de Atendimento (min)','No-show','Observações')
    Set-RowValues $ws 1 1 $headers
    $ws.Range('A1:W1').Interior.Color = $navy
    $ws.Range('A1:W1').Font.Color = $white
    $ws.Range('A1:W1').Font.Bold = $true
    $ws.Range('A1:W1').WrapText = $true
    $ws.Range('A1:W1').HorizontalAlignment = -4108
    $ws.Range('A1:W1').VerticalAlignment = -4108
    $ws.Range('A1:W1').RowHeight = 40

    $examples = @(
        @('EXEMPLO-001',[datetime]'2026-08-24',(8/24),'Doca 01','Fornecedor Alfa','Transportadora Rota','PED-1001','NF-5001','Paletizada',18,'Paletes','ABC1D23','José Silva','(11) 98888-1001','Concluído',(8.25/24),(8.5/24),(9.5/24),'Descarga sem ocorrência.'),
        @('EXEMPLO-002',[datetime]'2026-08-24',(9/24),'Doca 02','Fornecedor Beta','Transportadora Via','PED-1002','NF-5002','Batida',240,'Caixas','EFG4H56','Marcos Lima','(11) 98888-1002','Concluído',(8.9166667/24),(9.0833333/24),(10.25/24),'Chegada antecipada.'),
        @('EXEMPLO-003',[datetime]'2026-08-24',(10/24),'Doca 01','Fornecedor Gama','Transportadora Sul','PED-1003','NF-5003','Granel',12,'Toneladas','IJK7L89','André Souza','(11) 98888-1003','No-show',$null,$null,$null,'Fornecedor não compareceu.'),
        @('EXEMPLO-004',[datetime]'2026-08-25',(8/24),'Doca 03','Fornecedor Alfa','Transportadora Via','PED-1004','NF-5004','Devolução',32,'Unidades','MNO1P23','Lucas Reis','(11) 98888-1004','Cancelado',$null,$null,$null,'Cancelado com antecedência.'),
        @('EXEMPLO-005',[datetime]'2026-08-25',(9.5/24),'Doca 02','Fornecedor Beta','Transportadora Rota','PED-1005','NF-5005','Paletizada',24,'Paletes','QRS4T56','Paulo Nunes','(11) 98888-1005','Em atendimento',(10/24),(10.25/24),$null,'Atendimento em curso.'),
        @('EXEMPLO-006',[datetime]'2026-08-25',(11/24),'Doca 01','Fornecedor Gama','Transportadora Sul','PED-1006','NF-5006','Contêiner',1,'Unidades','UVW7X89','Rafael Dias','(11) 98888-1006','Reagendado',$null,$null,$null,'Movido para o dia seguinte.'),
        @('EXEMPLO-007',[datetime]'2026-08-26',(8.5/24),'Doca 03','Fornecedor Alfa','Transportadora Rota','PED-1007','NF-5007','Batida',180,'Caixas','YZA1B23','Fábio Melo','(11) 98888-1007','Confirmado',$null,$null,$null,'Documentação confirmada.'),
        @('EXEMPLO-008',[datetime]'2026-08-26',(10/24),'Doca 02','Fornecedor Beta','Transportadora Via','PED-1008','NF-5008','Paletizada',20,'Paletes','CDE4F56','Diego Alves','(11) 98888-1008','Agendado',$null,$null,$null,'Aguardando confirmação.')
    )
    for ($i=0; $i -lt $examples.Count; $i++) {
        $r = $i + 2
        $item = $examples[$i]
        $inputValues = @($item[0],$item[1],$item[2],$item[3],$item[4],$item[5],$item[6],$item[7],$item[8],$item[9],$item[10],$item[11],$item[12],$item[13],$item[14],$item[15],$item[16],$item[17])
        Set-RowValues $ws $r 1 $inputValues
        $ws.Cells.Item($r,23).Value2 = $item[18]
    }
    for ($r=2; $r -le 501; $r++) {
        $ws.Cells.Item($r,19).Formula = ('=IF(OR($C{0}="",$P{0}=""),"",MAX(0,ROUND(($P{0}-$C{0})*1440,0)))' -f $r)
        $ws.Cells.Item($r,20).Formula = ('=IF(OR($P{0}="",$Q{0}=""),"",MAX(0,ROUND(($Q{0}-$P{0})*1440,0)))' -f $r)
        $ws.Cells.Item($r,21).Formula = ('=IF(OR($Q{0}="",$R{0}=""),"",MAX(0,ROUND(($R{0}-$Q{0})*1440,0)))' -f $r)
        $ws.Cells.Item($r,22).Formula = ('=IF($A{0}="","",IF($O{0}="No-show","Sim","Não"))' -f $r)
    }
    $ws.Range('B2:B501').NumberFormat = 'dd/mm/yyyy'
    $ws.Range('C2:C501').NumberFormat = 'hh:mm'
    $ws.Range('P2:R501').NumberFormat = 'hh:mm'
    $ws.Range('J2:J501').NumberFormat = '0.00'
    $ws.Range('S2:U501').NumberFormat = '0'
    $ws.Range('A1:W501').Font.Name = 'Aptos'
    $ws.Range('A2:W501').Font.Size = 10
    $ws.Range('A2:W501').Borders.Color = $line
    $ws.Range('A2:W501').VerticalAlignment = -4108
    $ws.Range('W2:W501').WrapText = $true
    $widths = @(16,12,15,12,24,24,15,15,16,12,12,13,20,17,18,17,20,18,14,18,22,12,34)
    for ($c=1; $c -le 23; $c++) { $ws.Columns.Item($c).ColumnWidth = $widths[$c-1] }
    [void](Add-Table $ws 'A1:W501' 'TabelaAgenda' 'TableStyleMedium4')
    $validations = @(
        @('D2:D501','=ListaDocas'), @('E2:E501','=ListaFornecedores'), @('F2:F501','=ListaTransportadoras'),
        @('I2:I501','=ListaTiposCarga'), @('K2:K501','=ListaUnidades'), @('O2:O501','=ListaStatus')
    )
    foreach ($validation in $validations) {
        $range = $ws.Range($validation[0])
        $range.Validation.Delete()
        $range.Validation.Add(3,1,1,$validation[1])
        $range.Validation.IgnoreBlank = $true
        $range.Validation.InCellDropdown = $true
        $range.Validation.ErrorTitle = 'Valor não cadastrado'
        $range.Validation.ErrorMessage = 'Escolha um item da lista ou atualize a aba Cadastros.'
        $range.Validation.ShowError = $true
    }
    $dataRange = $ws.Range('A2:W501')
    [void]$dataRange.FormatConditions.Add(2,0,'=$O2="No-show"'); $dataRange.FormatConditions.Item(1).Interior.Color = $danger
    [void]$dataRange.FormatConditions.Add(2,0,'=$O2="Cancelado"'); $dataRange.FormatConditions.Item(2).Interior.Color = $gray
    [void]$dataRange.FormatConditions.Add(2,0,'=$O2="Concluído"'); $dataRange.FormatConditions.Item(3).Interior.Color = $success
    [void]$dataRange.FormatConditions.Add(2,0,'=$O2="Agendado"'); $dataRange.FormatConditions.Item(4).Interior.Color = $warning
    [void]$dataRange.FormatConditions.Add(2,0,'=$O2="Confirmado"'); $dataRange.FormatConditions.Item(5).Interior.Color = $warning
    [void]$ws.Range('S2:S501').FormatConditions.Add(1,5,'30'); $ws.Range('S2:S501').FormatConditions.Item(1).Interior.Color = 0x99CCFF
    $ws.Range('A2:R501').Locked = $false
    $ws.Range('W2:W501').Locked = $false
    $ws.Range('S2:V501').Locked = $true
    $ws.Protect('',$true,$true,$true,$true)
    $ws.EnableAutoFilter = $true
    $ws.Activate(); $excel.ActiveWindow.SplitRow = 1; $excel.ActiveWindow.FreezePanes = $true; $excel.ActiveWindow.DisplayGridlines = $false
    $ws.PageSetup.Orientation = 2
    $ws.PageSetup.Zoom = $false
    $ws.PageSetup.FitToPagesWide = 1
    $ws.PageSetup.FitToPagesTall = $false
    $ws.PageSetup.PrintTitleRows = '$1:$1'

    # Indicadores
    $ws = $workbook.Worksheets.Item('Indicadores')
    Set-TitleBand $ws 'A1:H2' 'Indicadores de Recebimento'
    $ws.Range('A3:H3').Merge(); $ws.Range('A3').Value2 = 'Atualização automática a partir da aba Agenda. Resultados demonstrativos enquanto os IDs EXEMPLO estiverem presentes.'
    $ws.Range('A3').Font.Color = $muted
    Set-Section $ws 'A5:D5' 'RESUMO'
    $metrics = @(
        @('Total de Agendamentos','=COUNTIF(Agenda!$A$2:$A$501,"<>")','0'),
        @('Concluídos','=COUNTIF(Agenda!$O$2:$O$501,"Concluído")','0'),
        @('No-shows','=COUNTIF(Agenda!$O$2:$O$501,"No-show")','0'),
        @('Cancelados','=COUNTIF(Agenda!$O$2:$O$501,"Cancelado")','0'),
        @('Reagendados','=COUNTIF(Agenda!$O$2:$O$501,"Reagendado")','0'),
        @('% de No-show','=IFERROR(B8/B6,0)','0.0%'),
        @('Tempo Médio de Espera','=IFERROR(AVERAGEIF(Agenda!$T$2:$T$501,">=0"),0)','0.0 "min"'),
        @('Tempo Médio de Atendimento','=IFERROR(AVERAGEIF(Agenda!$U$2:$U$501,">=0"),0)','0.0 "min"'),
        @('Atraso Médio','=IFERROR(AVERAGEIF(Agenda!$S$2:$S$501,">=0"),0)','0.0 "min"'),
        @('Quantidade de cargas por dia','=IFERROR(B6/SUMPRODUCT((Agenda!$B$2:$B$501<>"")/COUNTIF(Agenda!$B$2:$B$501,Agenda!$B$2:$B$501&"")),0)','0.0')
    )
    for ($i=0; $i -lt $metrics.Count; $i++) {
        $r=$i+6; $ws.Range("A$r").Value2=$metrics[$i][0]; $ws.Range("B$r").Formula=$metrics[$i][1]; $ws.Range("B$r").NumberFormat=$metrics[$i][2]
        $ws.Range("A$r:B$r").Borders.Color=$line
        if ($i % 2 -eq 0) { $ws.Range("A$r:B$r").Interior.Color=$pale }
    }
    Set-Section $ws 'D5:F5' 'ATENDIMENTOS POR DOCA'
    Set-RowValues $ws 6 4 @('Doca','Concluídos')
    for ($i=0; $i -lt 10; $i++) {
        $r=$i+7; $cadRow=$i+6
        $ws.Cells.Item($r,4).Formula = "=Cadastros!A$cadRow"
        $ws.Cells.Item($r,5).Formula = ('=IF(D{0}="","",COUNTIFS(Agenda!$D$2:$D$501,D{0},Agenda!$O$2:$O$501,"Concluído"))' -f $r)
    }
    Set-Section $ws 'A18:F18' 'ATENDIMENTOS POR FORNECEDOR'
    Set-RowValues $ws 19 1 @('Fornecedor','Concluídos')
    for ($i=0; $i -lt 12; $i++) {
        $r=$i+20; $cadRow=$i+7
        $ws.Cells.Item($r,1).Formula = "=Cadastros!D$cadRow"
        $ws.Cells.Item($r,2).Formula = ('=IF(A{0}="","",COUNTIFS(Agenda!$E$2:$E$501,A{0},Agenda!$O$2:$O$501,"Concluído"))' -f $r)
    }
    Set-Section $ws 'D18:H18' 'COMO LER'
    $ws.Range('D20:H26').Merge()
    $ws.Range('D20').Value2 = 'Compare períodos equivalentes e investigue os desvios. Um atraso médio pode esconder parceiros ou horários críticos. Use os filtros da Agenda para segmentar os dados e evite transformar médias em metas universais.'
    $ws.Range('D20').WrapText = $true
    $ws.Range('D20').VerticalAlignment = -4160
    $ws.Range('D20').Interior.Color = $pale
    $ws.Range('A1:H32').Font.Name='Aptos'
    $ws.Range('A5:H32').Borders.Color=$line
    $ws.Range('D6:E6').Interior.Color=$lightGreen; $ws.Range('D6:E6').Font.Bold=$true
    $ws.Range('A19:B19').Interior.Color=$lightGreen; $ws.Range('A19:B19').Font.Bold=$true
    $ws.Columns('A').ColumnWidth=32; $ws.Columns('B').ColumnWidth=18; $ws.Columns('C').ColumnWidth=3; $ws.Columns('D').ColumnWidth=22; $ws.Columns('E:F').ColumnWidth=16; $ws.Columns('G:H').ColumnWidth=14
    $ws.Activate(); $excel.ActiveWindow.SplitRow=5; $excel.ActiveWindow.FreezePanes=$true; $excel.ActiveWindow.DisplayGridlines=$false
    $ws.PageSetup.PrintArea='$A$1:$H$32'; $ws.PageSetup.Zoom=$false; $ws.PageSetup.FitToPagesWide=1; $ws.PageSetup.FitToPagesTall=1

    # Dashboard
    $ws = $workbook.Worksheets.Item('Dashboard')
    Set-TitleBand $ws 'A1:N2' 'Dashboard de Agendamento de Docas'
    $ws.Range('A3:N3').Merge(); $ws.Range('A3').Value2 = 'Visão gerencial automática — exemplos demonstrativos devem ser excluídos antes do uso real.'
    $ws.Range('A3').Font.Color = $muted
    $cards = @(
        @('A5:C5','A6:C8','Agendamentos','=Indicadores!B6','0'),
        @('E5:G5','E6:G8','Concluídos','=Indicadores!B7','0'),
        @('I5:K5','I6:K8','No-show','=Indicadores!B8','0'),
        @('M5:N5','M6:N8','Atraso médio','=Indicadores!B14','0.0 "min"'),
        @('A10:C10','A11:C13','Espera média','=Indicadores!B12','0.0 "min"'),
        @('E10:G10','E11:G13','Atendimento médio','=Indicadores!B13','0.0 "min"')
    )
    foreach ($card in $cards) {
        $ws.Range($card[0]).Merge(); $ws.Range($card[0].Split(':')[0]).Value2=$card[2]
        $ws.Range($card[0]).Interior.Color=$green; $ws.Range($card[0]).Font.Color=$white; $ws.Range($card[0]).Font.Bold=$true
        $ws.Range($card[1]).Merge(); $anchor=$card[1].Split(':')[0]; $ws.Range($anchor).Formula=$card[3]; $ws.Range($anchor).NumberFormat=$card[4]
        $ws.Range($card[1]).Interior.Color=$pale; $ws.Range($card[1]).Font.Size=22; $ws.Range($card[1]).Font.Bold=$true; $ws.Range($card[1]).HorizontalAlignment=-4108; $ws.Range($card[1]).VerticalAlignment=-4108
        $ws.Range($card[0]).HorizontalAlignment=-4108
        $ws.Range($card[0]).Borders.Color=$line; $ws.Range($card[1]).Borders.Color=$line
    }
    $statusChartRows = @(@('Status','Quantidade'),@('Agendado',$null),@('Confirmado',$null),@('Em espera',$null),@('Em atendimento',$null),@('Concluído',$null),@('Reagendado',$null),@('Cancelado',$null),@('No-show',$null))
    for ($i=0; $i -lt $statusChartRows.Count; $i++) { Set-RowValues $ws ($i+2) 16 $statusChartRows[$i] }
    for($r=3;$r -le 10;$r++){ $ws.Cells.Item($r,17).Formula="=COUNTIF(Agenda!`$O`$2:`$O`$501,P$r)" }
    $dockChartRows = @(@('Doca','Agendamentos'),@('Doca 01',$null),@('Doca 02',$null),@('Doca 03',$null))
    for ($i=0; $i -lt $dockChartRows.Count; $i++) { Set-RowValues $ws ($i+2) 19 $dockChartRows[$i] }
    for($r=3;$r -le 5;$r++){ $ws.Cells.Item($r,20).Formula="=COUNTIF(Agenda!`$D`$2:`$D`$501,S$r)" }
    $dashboardDates = @([datetime]'2026-08-24',[datetime]'2026-08-25',[datetime]'2026-08-26',[datetime]'2026-08-27',[datetime]'2026-08-28',[datetime]'2026-08-29',[datetime]'2026-08-30')
    Set-RowValues $ws 2 22 @('Data','Agendamentos')
    for($i=0;$i -lt $dashboardDates.Count;$i++){ $r=$i+3; $ws.Cells.Item($r,22).Value2=$dashboardDates[$i].ToString('dd/MM/yyyy'); $ws.Cells.Item($r,22).NumberFormat='dd/mm'; $ws.Cells.Item($r,23).Formula="=COUNTIF(Agenda!`$B`$2:`$B`$501,V$r)" }
    $chart1=$ws.ChartObjects().Add(15,260,390,245); $chart1.Chart.SetSourceData($ws.Range('P2:Q10')); $chart1.Chart.ChartType=51; $chart1.Chart.HasTitle=$true; $chart1.Chart.ChartTitle.Text='Agendamentos por status'; $chart1.Chart.HasLegend=$false
    $chart2=$ws.ChartObjects().Add(420,260,390,245); $chart2.Chart.SetSourceData($ws.Range('S2:T5')); $chart2.Chart.ChartType=51; $chart2.Chart.HasTitle=$true; $chart2.Chart.ChartTitle.Text='Agendamentos por doca'; $chart2.Chart.HasLegend=$false
    $chart3=$ws.ChartObjects().Add(825,260,390,245); $chart3.Chart.SetSourceData($ws.Range('V2:W9')); $chart3.Chart.ChartType=4; $chart3.Chart.HasTitle=$true; $chart3.Chart.ChartTitle.Text='Agendamentos por dia'; $chart3.Chart.HasLegend=$false
    $ws.Range('A31:N33').Merge(); $ws.Range('A31').Value2="Sua operação cresceu além da planilha? Conheça o Doca Certa — sistema de agendamento e gestão de docas. docacerta.com.br"; $ws.Range('A31').WrapText=$true; $ws.Range('A31').Interior.Color=$navy; $ws.Range('A31').Font.Color=$white; $ws.Range('A31').Font.Bold=$true; $ws.Range('A31').HorizontalAlignment=-4108; $ws.Range('A31').VerticalAlignment=-4108
    [void]$ws.Hyperlinks.Add($ws.Range('A31'), 'https://docacerta.com.br', '', 'Conheça o Doca Certa', $ws.Range('A31').Value2)
    $ws.Columns('A:N').ColumnWidth=11; $ws.Columns('D').ColumnWidth=3; $ws.Columns('H').ColumnWidth=3; $ws.Columns('L').ColumnWidth=3
    $ws.Range('A1:N33').Font.Name='Aptos'
    $ws.Columns('P:W').Hidden=$true
    $ws.Activate(); $excel.ActiveWindow.DisplayGridlines=$false
    $ws.PageSetup.PrintArea='$A$1:$N$33'; $ws.PageSetup.Orientation=2; $ws.PageSetup.Zoom=$false; $ws.PageSetup.FitToPagesWide=1; $ws.PageSetup.FitToPagesTall=1

    # Ordem, propriedades e cálculo.
    $workbook.Worksheets.Item('Instruções').Move($workbook.Worksheets.Item(1))
    try { $workbook.BuiltinDocumentProperties('Title').Value = 'Planilha Gratuita de Agendamento de Docas' } catch { }
    try { $workbook.BuiltinDocumentProperties('Author').Value = 'JGM4 Consultoria Logística' } catch { }
    try { $workbook.BuiltinDocumentProperties('Subject').Value = 'Agenda de recebimentos, docas, fornecedores e indicadores' } catch { }
    $excel.CalculateFull()
    if (Test-Path -LiteralPath $outputPath) { Remove-Item -LiteralPath $outputPath -Force }
    $workbook.SaveAs($outputPath, 51)

    $workbook.Save()
    $workbook.Close($true)
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($workbook)
    $workbook = $null

    # Reabre e valida estrutura, fórmulas, listas, tabela, gráficos e links.
    $check = $excel.Workbooks.Open($outputPath, 0, $true)
    $actualNames = @($check.Worksheets | ForEach-Object { $_.Name })
    foreach ($required in $sheetNames) { if ($actualNames -notcontains $required) { throw "Aba ausente: $required" } }
    $agenda = $check.Worksheets.Item('Agenda')
    if ($agenda.ListObjects.Count -lt 1) { throw 'Tabela estruturada ausente na Agenda.' }
    if ($agenda.Range('S2').Formula -notlike '=IF*') { throw 'Fórmula de atraso ausente.' }
    if ($agenda.Range('O2').Validation.Type -ne 3) { throw 'Validação de status ausente.' }
    if ($check.Worksheets.Item('Dashboard').ChartObjects().Count -lt 3) { throw 'Gráficos do Dashboard ausentes.' }
    if ($check.Worksheets.Item('Instruções').Hyperlinks.Count -lt 1) { throw 'Link do Doca Certa ausente.' }
    $check.Close($false)
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($check)
    $info = Get-Item -LiteralPath $outputPath
    Write-Output "OK|$($info.FullName)|$($info.Length)|$($sheetNames -join ',')"
}
finally {
    if ($null -ne $workbook) { try { $workbook.Close($false) } catch {} }
    if ($null -ne $excel) { try { $excel.Quit() } catch {}; [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
