# Brief 27 step 0: build and run NowPlayingSpike.cs with only what ships with Windows.
# Usage (PowerShell, in the repository folder):  powershell -ExecutionPolicy Bypass -File tools\spike\now-playing-spike.ps1
$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$csc = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$meta = "$env:WINDIR\System32\WinMetadata"
$fw = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319"
$out = Join-Path $env:TEMP 'TaPoardNowPlayingSpike.exe'
$winmd = @("/r:$meta\Windows.Foundation.winmd", "/r:$meta\Windows.Media.winmd", "/r:$meta\Windows.Storage.winmd")
$variants = @(
  @{ name = 'A: WinMetadata only'; refs = $winmd },
  @{ name = 'B: + System.Runtime facade'; refs = $winmd + @("/r:$fw\System.Runtime.dll") },
  @{ name = 'C: + System.Runtime + InteropServices.WindowsRuntime'
     refs = $winmd + @("/r:$fw\System.Runtime.dll", "/r:$fw\System.Runtime.InteropServices.WindowsRuntime.dll") }
)
foreach ($variant in $variants) {
  Write-Output "=== $($variant.name)"
  Remove-Item $out -ErrorAction SilentlyContinue
  & $csc /nologo /target:exe "/out:$out" $variant.refs (Join-Path $here 'NowPlayingSpike.cs') 2>&1 | ForEach-Object { Write-Output $_ }
  if (Test-Path $out) {
    Write-Output '--- built; running (play a song first)'
    & $out 2>&1 | ForEach-Object { Write-Output $_ }
    break
  }
}
