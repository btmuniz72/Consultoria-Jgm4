$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$activeFiles = Get-ChildItem -Path $root -File -Recurse -Include *.html,*.js |
  Where-Object { $_.FullName -notmatch '\\(backups-remotos-ftps|deploy-correcao-visual-jgm4-20260811|arquivo-morto)\\' }

function Assert-True($condition, $message) {
  if (-not $condition) { throw "FAIL: $message" }
  Write-Host "PASS: $message"
}

$activeText = ($activeFiles | Get-Content -Raw) -join "`n"
$measurement = Get-Content (Join-Path $root 'js\measurement.js') -Raw
$quiz = Get-Content (Join-Path $root 'pages\analise.html') -Raw
$thanks = Get-Content (Join-Path $root 'pages\obrigado.html') -Raw

Assert-True ($measurement -match 'whatsapp_click') 'whatsapp_click existe na camada central'
Assert-True ($measurement -match 'assessment_start') 'assessment_start existe na camada central'
Assert-True ($measurement -match 'diagnostic_start') 'diagnostic_start existe na camada central'
Assert-True ($measurement -match 'appointment_start') 'appointment_start existe na camada central'
Assert-True ($measurement -match 'doca_certa_click') 'doca_certa_click existe na camada central'
Assert-True ($measurement -match 'sessionStorage') 'lead válido usa sessionStorage'
Assert-True ($quiz -match 'checkValidity') 'quiz valida o formulário antes do sucesso'
Assert-True ($quiz -match 'markValidLead') 'quiz marca lead somente antes do envio'
Assert-True ($thanks -match 'consumeValidLead') 'obrigado consome a marca de lead'
Assert-True (($activeText -split 'generate_lead').Count - 1 -eq 1) 'há apenas um ponto de emissão de generate_lead no código ativo'
Assert-True ($activeText -notmatch 'gtag.*conversion') 'não há conversão Ads inline por clique'
Assert-True ($activeText -notmatch 'whatsapp_lead') 'não há evento legado whatsapp_lead'
Assert-True ($measurement -notmatch 'link_url') 'a camada padronizada não envia link_url'
Assert-True ($measurement -match 'piiKeys' -and $measurement -match 'message|mensagem|telefone|email|phone|cpf') 'a camada padronizada bloqueia campos PII'
Write-Host 'Measurement validation completed.'
