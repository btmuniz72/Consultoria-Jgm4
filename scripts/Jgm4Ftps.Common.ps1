$ErrorActionPreference = 'Stop'

$script:Jgm4FtpsHost = 'br198-ip04.hostgator.com.br'
$script:Jgm4FtpsIp = '192.185.177.37'
$script:Jgm4FtpsPort = 21
$script:Jgm4FtpsRemoteRoot = '/jgm4consultoria.com.br'
$script:Jgm4CredentialTarget = 'JGM4_FTPS'

if (-not ('Jgm4CredentialNative' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class Jgm4CredentialNative
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL
    {
        public UInt32 Flags;
        public UInt32 Type;
        [MarshalAs(UnmanagedType.LPWStr)] public string TargetName;
        [MarshalAs(UnmanagedType.LPWStr)] public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public UInt32 CredentialBlobSize;
        public IntPtr CredentialBlob;
        public UInt32 Persist;
        public UInt32 AttributeCount;
        public IntPtr Attributes;
        [MarshalAs(UnmanagedType.LPWStr)] public string TargetAlias;
        [MarshalAs(UnmanagedType.LPWStr)] public string UserName;
    }

    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredRead(string target, UInt32 type, UInt32 reservedFlag, out IntPtr credentialPtr);

    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern void CredFree(IntPtr credentialPtr);
}
'@
}

function Get-Jgm4StoredCredential {
    [CmdletBinding()]
    param()

    $credentialPointer = [IntPtr]::Zero
    $credentialTypeGeneric = 1
    $found = [Jgm4CredentialNative]::CredRead(
        $script:Jgm4CredentialTarget,
        $credentialTypeGeneric,
        0,
        [ref]$credentialPointer
    )

    if (-not $found) {
        $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        throw "A credencial generica '$($script:Jgm4CredentialTarget)' nao foi encontrada (erro Windows $errorCode)."
    }

    try {
        $nativeCredential = [Runtime.InteropServices.Marshal]::PtrToStructure(
            $credentialPointer,
            [type][Jgm4CredentialNative+CREDENTIAL]
        )

        $plainPassword = if ($nativeCredential.CredentialBlobSize -gt 0) {
            [Runtime.InteropServices.Marshal]::PtrToStringUni(
                $nativeCredential.CredentialBlob,
                [int]($nativeCredential.CredentialBlobSize / 2)
            )
        } else {
            ''
        }

        $securePassword = ConvertTo-SecureString $plainPassword -AsPlainText -Force
        return [Management.Automation.PSCredential]::new($nativeCredential.UserName, $securePassword)
    } finally {
        $plainPassword = $null
        if ($credentialPointer -ne [IntPtr]::Zero) {
            [Jgm4CredentialNative]::CredFree($credentialPointer)
        }
    }
}

function ConvertTo-Jgm4RemoteUri {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [AllowEmptyString()]
        [string]$RelativePath,

        [switch]$Directory
    )

    $normalized = $RelativePath.Replace('\', '/').Trim('/')
    $segments = @($script:Jgm4FtpsRemoteRoot.Trim('/'))
    if ($normalized) {
        $segments += $normalized.Split('/') | ForEach-Object { [Uri]::EscapeDataString($_) }
    }

    $path = '/' + ($segments -join '/')
    if ($Directory -and -not $path.EndsWith('/')) {
        $path += '/'
    }

    return [Uri]::new("ftp://$($script:Jgm4FtpsHost):$($script:Jgm4FtpsPort)$path")
}

function New-Jgm4FtpRequest {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [Uri]$Uri,

        [Parameter(Mandatory)]
        [string]$Method,

        [Parameter(Mandatory)]
        [Management.Automation.PSCredential]$Credential
    )

    $request = [Net.FtpWebRequest]::Create($Uri)
    $request.Method = $Method
    $request.Credentials = $Credential.GetNetworkCredential()
    $request.EnableSsl = $true
    $request.UsePassive = $true
    $request.UseBinary = $true
    $request.KeepAlive = $false
    $request.Timeout = 60000
    $request.ReadWriteTimeout = 60000
    return $request
}

function Get-Jgm4FtpListing {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [Management.Automation.PSCredential]$Credential,

        [string]$RelativePath = ''
    )

    $uri = ConvertTo-Jgm4RemoteUri -RelativePath $RelativePath -Directory
    $request = New-Jgm4FtpRequest -Uri $uri -Method ([Net.WebRequestMethods+Ftp]::ListDirectory) -Credential $Credential
    $response = $request.GetResponse()
    try {
        $reader = [IO.StreamReader]::new($response.GetResponseStream())
        try {
            return @($reader.ReadToEnd() -split "`r?`n" | Where-Object { $_ })
        } finally {
            $reader.Dispose()
        }
    } finally {
        $response.Dispose()
    }
}

function Test-Jgm4FtpFile {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [Management.Automation.PSCredential]$Credential,

        [Parameter(Mandatory)]
        [string]$RelativePath
    )

    $uri = ConvertTo-Jgm4RemoteUri -RelativePath $RelativePath
    $request = New-Jgm4FtpRequest -Uri $uri -Method ([Net.WebRequestMethods+Ftp]::GetFileSize) -Credential $Credential
    try {
        $response = $request.GetResponse()
        try {
            return [long]$response.ContentLength
        } finally {
            $response.Dispose()
        }
    } catch [Net.WebException] {
        $ftpResponse = $_.Exception.Response -as [Net.FtpWebResponse]
        if ($ftpResponse -and $ftpResponse.StatusCode -eq [Net.FtpStatusCode]::ActionNotTakenFileUnavailable) {
            $ftpResponse.Dispose()
            return $null
        }
        throw
    }
}

function Receive-Jgm4FtpFile {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [Management.Automation.PSCredential]$Credential,

        [Parameter(Mandatory)]
        [string]$RelativePath,

        [Parameter(Mandatory)]
        [string]$Destination
    )

    $parent = Split-Path -Parent $Destination
    if ($parent) {
        [IO.Directory]::CreateDirectory($parent) | Out-Null
    }

    $uri = ConvertTo-Jgm4RemoteUri -RelativePath $RelativePath
    $request = New-Jgm4FtpRequest -Uri $uri -Method ([Net.WebRequestMethods+Ftp]::DownloadFile) -Credential $Credential
    $response = $request.GetResponse()
    try {
        $inputStream = $response.GetResponseStream()
        $outputStream = [IO.File]::Create($Destination)
        try {
            $inputStream.CopyTo($outputStream)
        } finally {
            $outputStream.Dispose()
            $inputStream.Dispose()
        }
    } finally {
        $response.Dispose()
    }
}

function New-Jgm4FtpDirectory {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [Management.Automation.PSCredential]$Credential,

        [Parameter(Mandatory)]
        [string]$RelativePath
    )

    $current = ''
    foreach ($segment in $RelativePath.Replace('\', '/').Trim('/').Split('/') | Where-Object { $_ }) {
        $current = if ($current) { "$current/$segment" } else { $segment }
        $uri = ConvertTo-Jgm4RemoteUri -RelativePath $current -Directory
        $request = New-Jgm4FtpRequest -Uri $uri -Method ([Net.WebRequestMethods+Ftp]::MakeDirectory) -Credential $Credential
        try {
            $response = $request.GetResponse()
            $response.Dispose()
        } catch [Net.WebException] {
            $ftpResponse = $_.Exception.Response -as [Net.FtpWebResponse]
            if ($ftpResponse -and $ftpResponse.StatusCode -eq [Net.FtpStatusCode]::ActionNotTakenFileUnavailable) {
                $ftpResponse.Dispose()
                continue
            }
            throw
        }
    }
}

function Send-Jgm4FtpFile {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [Management.Automation.PSCredential]$Credential,

        [Parameter(Mandatory)]
        [string]$Source,

        [Parameter(Mandatory)]
        [string]$RelativePath
    )

    $remoteDirectory = [IO.Path]::GetDirectoryName($RelativePath)
    if ($remoteDirectory) {
        New-Jgm4FtpDirectory -Credential $Credential -RelativePath $remoteDirectory
    }

    $uri = ConvertTo-Jgm4RemoteUri -RelativePath $RelativePath
    $request = New-Jgm4FtpRequest -Uri $uri -Method ([Net.WebRequestMethods+Ftp]::UploadFile) -Credential $Credential
    $file = Get-Item -LiteralPath $Source
    $request.ContentLength = $file.Length
    $inputStream = [IO.File]::OpenRead($file.FullName)
    $outputStream = $request.GetRequestStream()
    try {
        $inputStream.CopyTo($outputStream)
    } finally {
        $outputStream.Dispose()
        $inputStream.Dispose()
    }

    $response = $request.GetResponse()
    $response.Dispose()
}
