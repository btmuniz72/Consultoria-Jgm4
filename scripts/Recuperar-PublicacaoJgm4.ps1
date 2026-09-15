[CmdletBinding()]
param(
    [string]$Pacote = (Join-Path (Split-Path -Parent $PSScriptRoot) 'deploy-correcao-visual-jgm4-20260811\upload'),
    [string]$Publicacao = (Join-Path (Split-Path -Parent $PSScriptRoot) 'backups-remotos-ftps\20260811-222730')
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Jgm4Ftps.Common.ps1')

$ftpIp = '192.185.177.37'
$packageRoot = (Resolve-Path -LiteralPath $Pacote).Path.TrimEnd('\', '/')
$publicationRoot = (Resolve-Path -LiteralPath $Publicacao).Path.TrimEnd('\', '/')
$oldVerifyRoot = Join-Path $publicationRoot '_verificacao-pos-upload'
$recoveryVerifyRoot = Join-Path $publicationRoot '_verificacao-recuperacao'
[IO.Directory]::CreateDirectory($recoveryVerifyRoot) | Out-Null

function ConvertTo-CurlConfigValue {
    param([AllowEmptyString()][string]$Value)
    return $Value.Replace('\', '\\').Replace('"', '\"').Replace("`r", '\r').Replace("`n", '\n')
}

function Invoke-SingleCurl {
    param(
        [Parameter(Mandatory)][Collections.Generic.List[string]]$Config,
        [Parameter(Mandatory)][string]$Password,
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
        foreach ($line in $Config) { $process.StandardInput.WriteLine($line) }
        $process.StandardInput.Close()
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        $stdout = $stdoutTask.Result
        $stderr = $stderrTask.Result
        if ($Password) {
            $stdout = $stdout.Replace($Password, '[SEGREDO-REMOVIDO]')
            $stderr = $stderr.Replace($Password, '[SEGREDO-REMOVIDO]')
        }
        if ($process.ExitCode -ne 0) {
            throw "$Operation falhou (curl $($process.ExitCode)): $($stderr.Trim())"
        }
    } finally {
        $process.Dispose()
    }
}

function New-BaseConfig {
    param([string]$UserAndPassword)
    $config = [Collections.Generic.List[string]]::new()
    $config.Add("user = `"$UserAndPassword`"")
    $config.Add("resolve = `"$script:Jgm4FtpsHost`:$script:Jgm4FtpsPort`:$ftpIp`"")
    $config.Add('ssl-reqd')
    $config.Add('ftp-skip-pasv-ip')
    $config.Add('silent')
    $config.Add('show-error')
    $config.Add('connect-timeout = 20')
    $config.Add('max-time = 180')
    return ,$config
}

function Send-OneFile {
    param([string]$Source, [string]$RelativePath, [string]$UserAndPassword, [string]$Password)
    $config = New-BaseConfig -UserAndPassword $UserAndPassword
    $config.Add('ftp-create-dirs')
    $config.Add("upload-file = `"$(ConvertTo-CurlConfigValue $Source.Replace('\', '/'))`"")
    $config.Add("url = `"$(ConvertTo-CurlConfigValue (ConvertTo-Jgm4RemoteUri -RelativePath $RelativePath).AbsoluteUri)`"")
    Invoke-SingleCurl -Config $config -Password $Password -Operation "upload de $RelativePath"
}

function Receive-OneFile {
    param([string]$Destination, [string]$RelativePath, [string]$UserAndPassword, [string]$Password)
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Destination)) | Out-Null
    $config = New-BaseConfig -UserAndPassword $UserAndPassword
    $config.Add('remove-on-error')
    $config.Add("output = `"$(ConvertTo-CurlConfigValue $Destination.Replace('\', '/'))`"")
    $config.Add("url = `"$(ConvertTo-CurlConfigValue (ConvertTo-Jgm4RemoteUri -RelativePath $RelativePath).AbsoluteUri)`"")
    Invoke-SingleCurl -Config $config -Password $Password -Operation "download de verificacao de $RelativePath"
}

$all = @(
    Get-ChildItem -LiteralPath $packageRoot -Recurse -File | Sort-Object FullName | ForEach-Object {
        $relative = $_.FullName.Substring($packageRoot.Length).TrimStart('\', '/').Replace('\', '/')
        $oldVerification = Join-Path $oldVerifyRoot $relative.Replace('/', '\')
        $localHash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
        $oldHash = if (Test-Path -LiteralPath $oldVerification -PathType Leaf) {
            (Get-FileHash -LiteralPath $oldVerification -Algorithm SHA256).Hash
        }
        [pscustomobject]@{
            arquivo = $relative
            origem = $_.FullName
            bytes = $_.Length
            sha256 = $localHash
            confirmado_anteriormente = ($oldHash -eq $localHash)
        }
    }
)
$failed = @($all | Where-Object { -not $_.confirmado_anteriormente })
if ($failed.Count -eq 0) {
    Write-Host 'Nenhum arquivo requer recuperacao.' -ForegroundColor Green
    return
}

$credential = Get-Jgm4StoredCredential
$networkCredential = $credential.GetNetworkCredential()
$plainPassword = $networkCredential.Password
$userAndPassword = ConvertTo-CurlConfigValue "$($networkCredential.UserName):$plainPassword"
$report = [Collections.Generic.List[object]]::new()

try {
    Write-Host "Recuperando $($failed.Count) arquivo(s), um por conexao FTPS..."
    $position = 0
    foreach ($entry in $failed) {
        $position++
        $relativeWindows = $entry.arquivo.Replace('/', '\')
        $verifyPath = Join-Path $recoveryVerifyRoot $relativeWindows
        $backupPath = Join-Path $publicationRoot $relativeWindows
        $confirmed = $false
        $lastError = $null

        foreach ($attempt in 1..2) {
            try {
                if (Test-Path -LiteralPath $verifyPath) { Remove-Item -LiteralPath $verifyPath -Force }
                Send-OneFile -Source $entry.origem -RelativePath $entry.arquivo -UserAndPassword $userAndPassword -Password $plainPassword
                Receive-OneFile -Destination $verifyPath -RelativePath $entry.arquivo -UserAndPassword $userAndPassword -Password $plainPassword
                $remoteHash = (Get-FileHash -LiteralPath $verifyPath -Algorithm SHA256).Hash
                if ($remoteHash -ne $entry.sha256) { throw "SHA-256 remoto divergente na tentativa $attempt." }
                $confirmed = $true
                break
            } catch {
                $lastError = $_
            }
        }

        if (-not $confirmed) {
            if ((Test-Path -LiteralPath $backupPath -PathType Leaf) -and ((Get-Item -LiteralPath $backupPath).Length -gt 0)) {
                Write-Warning "Falha persistente em $($entry.arquivo). Restaurando backup remoto anterior."
                Send-OneFile -Source $backupPath -RelativePath $entry.arquivo -UserAndPassword $userAndPassword -Password $plainPassword
            }
            throw "Recuperacao interrompida em $($entry.arquivo): $($lastError.Exception.Message)"
        }

        $report.Add([pscustomobject]@{
            arquivo = $entry.arquivo
            bytes = $entry.bytes
            sha256 = $entry.sha256
            verificacao = 'sha256_ok'
        })
        Write-Host ("[{0}/{1}] SHA-256 confirmado: {2}" -f $position, $failed.Count, $entry.arquivo)
    }

    $reportPath = Join-Path $publicationRoot 'relatorio-publicacao-recuperacao.csv'
    $report | Export-Csv -LiteralPath $reportPath -NoTypeInformation -Encoding utf8
    Write-Host "RECUPERACAO CONCLUIDA: $($report.Count) arquivo(s) confirmados." -ForegroundColor Green
    Write-Host "Relatorio: $reportPath"
} finally {
    $plainPassword = $null
    $userAndPassword = $null
    $networkCredential = $null
    $credential = $null
}
