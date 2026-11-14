param([switch]$UI)

# Compiles every 2.0 unit test against the real sources and runs it; -UI also runs the browser tests.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
New-Item -ItemType Directory -Force tests\bin | Out-Null
$csc = "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$tests = @(
    'SettingsV2Tests', 'WidgetRegistryTests', 'BuildInfoTests', 'LayoutV2Tests', 'DisplaySubscriptionTests',
    'InputSessionTests', 'MetricsSamplerTests', 'GpuMetricsTests', 'WeatherServiceTests', 'UrlImportTests', 'Release103Tests',
    'HostTests'
)
$failed = @()
foreach ($test in $tests) {
    & $csc /nologo /target:exe /main:$test /out:tests\bin\$test.exe /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll /r:System.Net.Http.dll src\*.cs tests\Fakes.cs tests\$test.cs
    if ($LASTEXITCODE -ne 0) { $failed += "$test (compile)"; continue }
    & tests\bin\$test.exe
    if ($LASTEXITCODE -ne 0) { $failed += $test }
}
if ($UI) {
    foreach ($script in Get-ChildItem tests\*-ui.cjs) {
        & node $script.FullName
        if ($LASTEXITCODE -ne 0) { $failed += $script.Name }
    }
}
if ($failed.Count) { throw ('Failed: ' + ($failed -join ', ')) }
Write-Host 'PASS all unit tests'
