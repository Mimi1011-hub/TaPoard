$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
New-Item -ItemType Directory -Force dist | Out-Null
$buildInfo = & .\tools\build-info.ps1 -OutputPath (Join-Path $PSScriptRoot 'tests\bin\BuildInfo.generated.cs')
& "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /optimize+ /target:winexe /win32icon:assets\TaPoard.ico /out:dist\TaPoard.exe /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll src\*.cs $buildInfo.Path
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
New-Item -ItemType Directory -Force dist\web | Out-Null
Copy-Item web\* dist\web -Recurse -Force
# The firewall repair button in the settings page runs this copy (as the installer does).
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'dist\setup-lan.ps1'), [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'packaging\setup-lan.ps1'), [Text.Encoding]::UTF8), [Text.UTF8Encoding]::new($true))
Get-ChildItem web -File | ForEach-Object {
    $published = Join-Path 'dist\web' $_.Name
    if ((Get-FileHash $_.FullName).Hash -ne (Get-FileHash $published).Hash) {
        throw "Published web asset does not match source: $($_.Name)"
    }
}
Write-Host ('Built dist\TaPoard.exe (' + $buildInfo.DisplayVersion + ')')
