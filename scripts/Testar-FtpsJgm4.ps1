[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Jgm4Ftps.Common.ps1')

$credential = Get-Jgm4StoredCredential
$networkCredential = $credential.GetNetworkCredential()

function ConvertTo-CurlConfigValue {
    param([AllowEmptyString()][string]$Value)
    return $Value.Replace('\', '\\').Replace('"', '\"').Replace("`r", '\r').Replace("`n", '\n')
}

$remoteUri = ConvertTo-Jgm4RemoteUri -RelativePath '' -Directory
$userAndPassword = ConvertTo-CurlConfigValue "$($networkCredential.UserName):$($networkCredential.Password)"
$safeUri = ConvertTo-CurlConfigValue $remoteUri.AbsoluteUri

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
    if (-not $process.Start()) { throw 'Nao foi possivel iniciar curl.exe.' }
    $process.StandardInput.WriteLine("url = `"$safeUri`"")
    $process.StandardInput.WriteLine("user = `"$userAndPassword`"")
    $process.StandardInput.WriteLine('resolve = "br198-ip04.hostgator.com.br:21:192.185.177.37"')
    $process.StandardInput.WriteLine('ssl-reqd')
    $process.StandardInput.WriteLine('list-only')
    $process.StandardInput.WriteLine('ftp-skip-pasv-ip')
    $process.StandardInput.WriteLine('silent')
    $process.StandardInput.WriteLine('show-error')
    $process.StandardInput.WriteLine('connect-timeout = 20')
    $process.StandardInput.WriteLine('max-time = 45')
    $process.StandardInput.Close()

    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $stdout = $stdoutTask.Result
    $stderr = $stderrTask.Result
    if ($process.ExitCode -ne 0) {
        throw "Falha na listagem FTPS (curl $($process.ExitCode)): $($stderr.Trim())"
    }
} finally {
    $userAndPassword = $null
    $networkCredential = $null
    $process.Dispose()
}

$items = @($stdout -split "`r?`n" | Where-Object { $_ })

[pscustomobject]@{
    servidor = $script:Jgm4FtpsHost
    porta = $script:Jgm4FtpsPort
    tls_obrigatorio = $true
    pasta_remota = $script:Jgm4FtpsRemoteRoot
    usuario = $credential.UserName
    quantidade_itens = $items.Count
}

$items | Sort-Object
