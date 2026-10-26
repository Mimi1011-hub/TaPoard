$ErrorActionPreference = 'Stop'
$setup = Join-Path $PSScriptRoot 'setup-lan.ps1'
$arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $setup + '"'
$process = Start-Process -FilePath powershell.exe -Verb RunAs -ArgumentList $arguments -Wait -PassThru
exit $process.ExitCode
