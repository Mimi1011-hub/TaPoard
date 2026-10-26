$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$version = '1.05'
$releaseRoot = Join-Path $PSScriptRoot 'release'
$stage = Join-Path $releaseRoot 'installer-payload'
$verify = Join-Path $releaseRoot 'installer-verification'
$payload = Join-Path $releaseRoot 'TaPoard-Payload.zip'
$installer = Join-Path $releaseRoot ('TaPoard-Setup-' + $version + '.exe')
$hashFile = $installer + '.sha256.txt'
$iconPreview = Join-Path $releaseRoot 'TaPoard-icon.png'

if (!(Test-Path -LiteralPath $releaseRoot)) { New-Item -ItemType Directory -Path $releaseRoot | Out-Null }
$resolvedRelease = [IO.Path]::GetFullPath($releaseRoot).TrimEnd('\') + '\'
foreach ($directory in @($stage,$verify)) {
    $resolved = [IO.Path]::GetFullPath($directory)
    if (!$resolved.StartsWith($resolvedRelease,[StringComparison]::OrdinalIgnoreCase)) { throw 'Package path escaped the release directory.' }
    if (Test-Path -LiteralPath $directory) { Remove-Item -LiteralPath $directory -Recurse -Force }
}
foreach ($file in @($payload,$installer,$hashFile,$iconPreview)) { if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force } }

New-Item -ItemType Directory -Path $stage | Out-Null
New-Item -ItemType Directory -Force tools\bin | Out-Null
& "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /optimize+ /target:exe /out:tools\bin\IconBuilder.exe /r:System.Drawing.dll tools\IconBuilder.cs
if ($LASTEXITCODE -ne 0) { throw 'Icon builder compilation failed.' }
& .\tools\bin\IconBuilder.exe .\assets\TaPoard-icon.png .\assets\TaPoard.ico .\web\icon-32.png .\web\icon-180.png .\web\icon-192.png .\web\icon-512.png
if ($LASTEXITCODE -ne 0) { throw 'Icon generation failed.' }

& "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /optimize+ /target:winexe /win32icon:assets\TaPoard.ico /out:"$stage\TaPoard.exe" /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll src\*.cs
if ($LASTEXITCODE -ne 0) { throw 'Application package build failed.' }
Copy-Item -LiteralPath web -Destination (Join-Path $stage 'web') -Recurse
Copy-Item -LiteralPath packaging\setup-lan.ps1,packaging\remove-firewall.ps1,packaging\README.txt -Destination $stage
foreach ($scriptName in @('setup-lan.ps1','remove-firewall.ps1')) {
    $scriptPath = Join-Path $stage $scriptName
    $scriptText = [IO.File]::ReadAllText($scriptPath, [Text.Encoding]::UTF8)
    [IO.File]::WriteAllText($scriptPath, $scriptText, [Text.UTF8Encoding]::new($true))
    $scriptBytes = [IO.File]::ReadAllBytes($scriptPath)
    if ($scriptBytes.Length -lt 3 -or $scriptBytes[0] -ne 0xEF -or $scriptBytes[1] -ne 0xBB -or $scriptBytes[2] -ne 0xBF) { throw ('PowerShell script is missing UTF-8 BOM: ' + $scriptName) }
}
[IO.File]::WriteAllText((Join-Path $stage 'VERSION.txt'), "TaPoard $version`r`nWindows 10/11 64-bit`r`n", [Text.UTF8Encoding]::new($false))

$forbidden = Get-ChildItem -LiteralPath $stage -Recurse -Force | Where-Object { $_.Name -in @('settings.json','network.json','network-status.txt','mdns-diagnostic.log') -or $_.FullName -match '[\\/]data[\\/]' }
if ($forbidden) { throw 'Private runtime data was included in the installer payload.' }

Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $payload -CompressionLevel Optimal
$resourceArgument = '/resource:' + $payload + ',TaPoard.Payload.zip'
& "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /optimize+ /target:winexe /win32icon:assets\TaPoard.ico /out:$installer $resourceArgument /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll installer\Installer.cs
if ($LASTEXITCODE -ne 0) { throw 'Installer build failed.' }

$extractProcess = Start-Process -FilePath $installer -ArgumentList '/extract-only',('"' + $verify + '"') -Wait -PassThru -WindowStyle Hidden
if ($extractProcess.ExitCode -ne 0) { throw 'Installer extraction verification failed.' }
foreach ($relative in @('TaPoard.exe','web\index.html','web\app.js','web\qrcode.js','web\QRCode.LICENSE.txt','web\style.css','web\manifest.webmanifest','web\icon-32.png','web\icon-180.png','web\icon-192.png','web\icon-512.png','setup-lan.ps1','remove-firewall.ps1','README.txt','VERSION.txt')) {
    $expected = Join-Path $stage $relative;$actual = Join-Path $verify $relative
    $matches = $false
    for ($attempt=0; $attempt -lt 10 -and !$matches; $attempt++) {
        if (Test-Path -LiteralPath $actual) {
            try { $matches = (Get-FileHash -LiteralPath $expected).Hash -eq (Get-FileHash -LiteralPath $actual).Hash } catch { $matches = $false }
        }
        if (!$matches) { Start-Sleep -Milliseconds 100 }
    }
    if (!$matches) { throw ('Installer verification failed: ' + $relative) }
}
$privateExtracted = Get-ChildItem -LiteralPath $verify -Recurse -Force | Where-Object { $_.Name -in @('settings.json','network.json','network-status.txt','mdns-diagnostic.log') -or $_.FullName -match '[\\/]data[\\/]' }
if ($privateExtracted) { throw 'Private runtime data was extracted from the installer.' }

Copy-Item -LiteralPath assets\TaPoard-icon.png -Destination $iconPreview
$hash = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText($hashFile, ($hash + '  ' + [IO.Path]::GetFileName($installer) + "`r`n"), [Text.UTF8Encoding]::new($false))
Remove-Item -LiteralPath $payload -Force
Remove-Item -LiteralPath $stage -Recurse -Force
Remove-Item -LiteralPath $verify -Recurse -Force
Write-Host ('Created installer: ' + $installer)
Write-Host ('SHA256: ' + $hash)
