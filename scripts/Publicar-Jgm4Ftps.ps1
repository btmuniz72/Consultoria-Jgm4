[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Container })]
    [string]$Pacote,

    [switch]$Publicar
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Jgm4Ftps.Common.ps1')

$workspace = (Split-Path -Parent $PSScriptRoot)
$packageRoot = (Resolve-Path -LiteralPath $Pacote).Path.TrimEnd('\', '/')
$ftpIp = '192.185.177.37'
$forbiddenSegments = @(
    '.git', '.agents', '.codex', '.claude', '.vscode',
    'scripts', 'documentacao', 'test-artifacts-identidade',
    'backups-remotos-ftps'
)

function ConvertTo-CurlConfigValue {
    param([AllowEmptyString()][string]$Value)
    return $Value.Replace('\', '\\').Replace('"', '\"').Replace("`r", '\r').Replace("`n", '\n')
}

function Invoke-Jgm4CurlBatch {
    param(
        [Parameter(Mandatory)][AllowEmptyCollection()][Collections.Generic.List[string]]$Config,
        [Parameter(Mandatory)][string]$PasswordForRedaction,
        [Parameter(Mandatory)][string]$Operation
    )

    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = (Get-Command curl.exe -ErrorAction Stop).Source
    $startInfo.ArgumentList.Add('--config')
    $startInfo.ArgumentList.Add('-')
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.CreateNoWindow = $true

    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    try {
        if (-not $process.Start()) { throw "Nao foi possivel iniciar curl.exe para $Operation." }
        foreach ($line in $Config) {
            $process.StandardInput.WriteLine($line)
        }
        $process.StandardInput.Close()
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        $stdout = $stdoutTask.Result
        $stderr = $stderrTask.Result
        if ($PasswordForRedaction) {
            $stdout = $stdout.Replace($PasswordForRedaction, '[SEGREDO-REMOVIDO]')
            $stderr = $stderr.Replace($PasswordForRedaction, '[SEGREDO-REMOVIDO]')
        }
        return [pscustomobject]@{
            ExitCode = $process.ExitCode
            Stdout = $stdout
            Stderr = $stderr
        }
    } finally {
        $process.Dispose()
    }
}

function Add-Jgm4CurlBaseConfig {
    param(
        [Parameter(Mandatory)][AllowEmptyCollection()][Collections.Generic.List[string]]$Config,
        [Parameter(Mandatory)][string]$UserAndPassword,
        [Parameter(Mandatory)][string]$RemoteUrl
    )

    $Config.Add("url = `"$(ConvertTo-CurlConfigValue $RemoteUrl)`"")
    $Config.Add("user = `"$UserAndPassword`"")
    $Config.Add("resolve = `"$script:Jgm4FtpsHost`:$script:Jgm4FtpsPort`:$script:Jgm4FtpsIp`"")
    $Config.Add('ssl-reqd')
    $Config.Add('ftp-skip-pasv-ip')
    $Config.Add('silent')
    $Config.Add('show-error')
    $Config.Add('connect-timeout = 20')
    $Config.Add('max-time = 120')
}

function New-Jgm4DownloadConfig {
    param(
        [Parameter(Mandatory)][array]$Entries,
        [Parameter(Mandatory)][string]$DestinationRoot,
        [Parameter(Mandatory)][string]$UserAndPassword
    )

    $config = [Collections.Generic.List[string]]::new()
    foreach ($entry in $Entries) {
        $destination = Join-Path $DestinationRoot $entry.arquivo.Replace('/', [IO.Path]::DirectorySeparatorChar)
        [IO.Directory]::CreateDirectory((Split-Path -Parent $destination)) | Out-Null
        $remoteUrl = (ConvertTo-Jgm4RemoteUri -RelativePath $entry.arquivo).AbsoluteUri
        Add-Jgm4CurlBaseConfig -Config $config -UserAndPassword $UserAndPassword -RemoteUrl $remoteUrl
        $config.Add("output = `"$(ConvertTo-CurlConfigValue $destination.Replace('\', '/'))`"")
        $config.Add('remove-on-error')
        $config.Add('next')
    }
    if ($config.Count -gt 0 -and $config[$config.Count - 1] -eq 'next') {
        $config.RemoveAt($config.Count - 1)
    }
    return $config
}

function New-Jgm4UploadConfig {
    param(
        [Parameter(Mandatory)][array]$Entries,
        [Parameter(Mandatory)][string]$UserAndPassword
    )

    $config = [Collections.Generic.List[string]]::new()
    foreach ($entry in $Entries) {
        $remoteUrl = (ConvertTo-Jgm4RemoteUri -RelativePath $entry.arquivo).AbsoluteUri
        Add-Jgm4CurlBaseConfig -Config $config -UserAndPassword $UserAndPassword -RemoteUrl $remoteUrl
        $config.Add("upload-file = `"$(ConvertTo-CurlConfigValue $entry.origem.Replace('\', '/'))`"")
        $config.Add('ftp-create-dirs')
        $config.Add('next')
    }
    if ($config.Count -gt 0 -and $config[$config.Count - 1] -eq 'next') {
        $config.RemoveAt($config.Count - 1)
    }
    return $config
}

$files = @(Get-ChildItem -LiteralPath $packageRoot -Recurse -File | Sort-Object FullName)
if ($files.Count -eq 0) {
    throw "O pacote '$packageRoot' nao contem arquivos."
}

$plan = @(
    foreach ($file in $files) {
        $relative = $file.FullName.Substring($packageRoot.Length).TrimStart('\', '/').Replace('\', '/')
        $segments = $relative.Split('/')
        if ($segments | Where-Object { $_ -in $forbiddenSegments -or $_ -like 'backup-*' -or $_ -like 'deploy-*' }) {
            throw "Arquivo interno recusado pelo publicador: $relative"
        }

        [pscustomobject]@{
            arquivo = $relative
            bytes = $file.Length
            origem = $file.FullName
            sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
        }
    }
)

Write-Host "Servidor TLS: $script:Jgm4FtpsHost ($ftpIp)"
Write-Host "Destino: $script:Jgm4FtpsRemoteRoot"
Write-Host "Pacote: $packageRoot"
Write-Host "Arquivos: $($plan.Count)"

if (-not $Publicar) {
    Write-Host 'SIMULACAO CONCLUIDA. Nenhum arquivo remoto foi alterado.' -ForegroundColor Yellow
    return
}

$credential = Get-Jgm4StoredCredential
$networkCredential = $credential.GetNetworkCredential()
$plainPassword = $networkCredential.Password
$userAndPassword = ConvertTo-CurlConfigValue "$($networkCredential.UserName):$plainPassword"
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = Join-Path $workspace "backups-remotos-ftps\$timestamp"
$verifyRoot = Join-Path $backupRoot '_verificacao-pos-upload'
[IO.Directory]::CreateDirectory($backupRoot) | Out-Null
[IO.Directory]::CreateDirectory($verifyRoot) | Out-Null

try {
    Write-Host '1/3 Baixando backup remoto...'
    $backupConfig = New-Jgm4DownloadConfig -Entries $plan -DestinationRoot $backupRoot -UserAndPassword $userAndPassword
    $backupResult = Invoke-Jgm4CurlBatch -Config $backupConfig -PasswordForRedaction $plainPassword -Operation 'backup'
    if ($backupResult.ExitCode -notin 0, 78) {
        throw "Falha no backup FTPS (curl $($backupResult.ExitCode)): $($backupResult.Stderr.Trim())"
    }

    Write-Host '2/3 Enviando pacote...'
    $uploadConfig = New-Jgm4UploadConfig -Entries $plan -UserAndPassword $userAndPassword
    $uploadResult = Invoke-Jgm4CurlBatch -Config $uploadConfig -PasswordForRedaction $plainPassword -Operation 'upload'
    if ($uploadResult.ExitCode -ne 0) {
        throw "Falha no upload FTPS (curl $($uploadResult.ExitCode)): $($uploadResult.Stderr.Trim())"
    }

    Write-Host '3/3 Baixando arquivos publicados para verificar SHA-256...'
    $verifyConfig = New-Jgm4DownloadConfig -Entries $plan -DestinationRoot $verifyRoot -UserAndPassword $userAndPassword
    $verifyResult = Invoke-Jgm4CurlBatch -Config $verifyConfig -PasswordForRedaction $plainPassword -Operation 'verificacao'
    if ($verifyResult.ExitCode -ne 0) {
        throw "Falha ao baixar a verificacao FTPS (curl $($verifyResult.ExitCode)): $($verifyResult.Stderr.Trim())"
    }

    $report = [Collections.Generic.List[object]]::new()
    $failed = [Collections.Generic.List[object]]::new()
    foreach ($entry in $plan) {
        $relativeWindows = $entry.arquivo.Replace('/', [IO.Path]::DirectorySeparatorChar)
        $backupPath = Join-Path $backupRoot $relativeWindows
        $verifyPath = Join-Path $verifyRoot $relativeWindows
        $remoteHash = if (Test-Path -LiteralPath $verifyPath -PathType Leaf) {
            (Get-FileHash -LiteralPath $verifyPath -Algorithm SHA256).Hash
        } else {
            $null
        }
        $ok = ($remoteHash -eq $entry.sha256)
        $record = [pscustomobject]@{
            arquivo = $entry.arquivo
            bytes = $entry.bytes
            backup = if (Test-Path -LiteralPath $backupPath -PathType Leaf) { 'baixado' } else { 'arquivo_novo' }
            sha256_local = $entry.sha256
            sha256_remoto = $remoteHash
            verificacao = if ($ok) { 'sha256_ok' } else { 'falhou' }
        }
        $report.Add($record)
        if (-not $ok) { $failed.Add($entry) }
    }

    if ($failed.Count -gt 0) {
        throw "A verificacao SHA-256 falhou para $($failed.Count) arquivo(s). Os backups foram preservados em $backupRoot."
    }

    $reportPath = Join-Path $backupRoot 'relatorio-publicacao.csv'
    $report | Export-Csv -LiteralPath $reportPath -NoTypeInformation -Encoding utf8
    Write-Host "PUBLICACAO CONCLUIDA: $($report.Count) arquivo(s), todos com SHA-256 confirmado." -ForegroundColor Green
    Write-Host "Backup e relatorio: $backupRoot"
} finally {
    $plainPassword = $null
    $userAndPassword = $null
    $networkCredential = $null
    $credential = $null
}
