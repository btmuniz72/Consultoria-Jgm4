[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$hostName = 'jgm4consultoria.com.br'
$port = 21
$script:observedCertificate = $null
$script:observedErrors = $null

function Read-FtpReply {
    param([IO.StreamReader]$Reader)

    $first = $Reader.ReadLine()
    if (-not $first) { throw 'O servidor FTP encerrou a conexao sem resposta.' }
    $lines = [Collections.Generic.List[string]]::new()
    $lines.Add($first)
    if ($first -match '^(\d{3})-') {
        $code = $Matches[1]
        do {
            $line = $Reader.ReadLine()
            if ($null -eq $line) { break }
            $lines.Add($line)
        } until ($line -match "^$code ")
    }
    return $lines
}

$client = [Net.Sockets.TcpClient]::new()
try {
    $client.Connect($hostName, $port)
    $networkStream = $client.GetStream()
    $reader = [IO.StreamReader]::new($networkStream, [Text.Encoding]::ASCII, $false, 1024, $true)
    $writer = [IO.StreamWriter]::new($networkStream, [Text.Encoding]::ASCII, 1024, $true)
    $writer.NewLine = "`r`n"
    $writer.AutoFlush = $true

    Read-FtpReply -Reader $reader | Out-Null
    $writer.WriteLine('AUTH TLS')
    $authReply = @(Read-FtpReply -Reader $reader)
    if ($authReply[0] -notmatch '^234 ') {
        throw "O servidor recusou AUTH TLS: $($authReply -join ' ')"
    }

    $callback = [Net.Security.RemoteCertificateValidationCallback] {
        param($sender, $certificate, $chain, $sslPolicyErrors)
        $script:observedCertificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new($certificate)
        $script:observedErrors = $sslPolicyErrors
        return $true
    }

    $sslStream = [Net.Security.SslStream]::new($networkStream, $false, $callback)
    try {
        $sslStream.AuthenticateAsClient($hostName)
    } finally {
        $sslStream.Dispose()
    }
} finally {
    $client.Dispose()
}

if (-not $script:observedCertificate) {
    throw 'O servidor nao apresentou certificado TLS.'
}

$san = $script:observedCertificate.Extensions |
    Where-Object { $_.Oid.Value -eq '2.5.29.17' } |
    ForEach-Object { $_.Format($false) }

[pscustomobject]@{
    host_testado = $hostName
    erros_validacao = [string]$script:observedErrors
    assunto = $script:observedCertificate.Subject
    emissor = $script:observedCertificate.Issuer
    nomes_alternativos = ($san -join '; ')
    valido_de = $script:observedCertificate.NotBefore
    valido_ate = $script:observedCertificate.NotAfter
    thumbprint = $script:observedCertificate.Thumbprint
}
