$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:18781'
$config = [IO.File]::ReadAllText("$PSScriptRoot\dist\data\settings-v3.json", [Text.Encoding]::UTF8) | ConvertFrom-Json
if ($config.schemaVersion -ne 3) { throw 'Unexpected settings schema version' }
$headers = @{ Authorization = 'Bearer ' + $config.security.token }
$adminKey = $env:TAPOARD_TEST_ADMIN_KEY
if ([string]::IsNullOrWhiteSpace($adminKey)) { throw 'Set TAPOARD_TEST_ADMIN_KEY before starting TaPoard and running test.ps1' }
$adminHeaders = @{ Authorization = 'Bearer ' + $adminKey }
function Assert-Status($Path, $Expected, $Auth, $Method = 'GET', $Body = $null) {
    try {
        $r = Invoke-WebRequest ($base + $Path) -UseBasicParsing -Headers $Auth -Method $Method -Body $Body -ContentType 'application/json'
        $actual = [int]$r.StatusCode
    } catch {
        if (!$_.Exception.Response) { throw }
        $actual = [int]$_.Exception.Response.StatusCode
    }
    if ($actual -ne $Expected) { throw "$Path expected $Expected, got $actual" }
    Write-Host "PASS $Method $Path ($actual)"
}
function Assert-Redirect($Path, $Location) {
    $request = [Net.HttpWebRequest]::Create($base + $Path)
    $request.AllowAutoRedirect = $false
    try {
        $response = $request.GetResponse()
    } catch [Net.WebException] {
        $response = $_.Exception.Response
    }
    try {
        if ([int]$response.StatusCode -ne 302 -or $response.Headers['Location'] -ne $Location) {
            throw "$Path did not redirect to $Location"
        }
    } finally {
        if ($response) { $response.Dispose() }
    }
    Write-Host "PASS GET $Path redirects to $Location"
}
Assert-Redirect '/' '/v4/'
Assert-Status '/index.html' 404 $headers
Assert-Status '/pc-window.html' 404 $headers
Assert-Status '/qrcode.js' 200 @{}
Assert-Status '/nosleep.min.js' 200 @{}
Assert-Status '/manifest.webmanifest' 200 @{}
Assert-Status '/icon-32.png' 200 @{}
Assert-Status '/icon-180.png' 200 @{}
Assert-Status '/icon-192.png' 200 @{}
Assert-Status '/icon-512.png' 200 @{}
Assert-Status '/v4/' 200 @{}
Assert-Status '/v4/app.js' 200 @{}
Assert-Status '/v4/core/api.js' 200 @{}
Assert-Status '/v4/i18n/ja.json' 200 @{}
Assert-Status '/v4/i18n/en.json' 200 @{}
Assert-Status '/v4/settings.html' 200 @{}
Assert-Status '/v4/style/phone.css' 200 @{}
$servedScript = (Invoke-WebRequest ($base + '/v4/app.js') -UseBasicParsing).Content
if ($servedScript -ne [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'web\v4\app.js'))) { throw 'Served JavaScript is stale' }
$servedQrScript = (Invoke-WebRequest ($base + '/qrcode.js') -UseBasicParsing).Content
if ($servedQrScript -ne [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'web\qrcode.js'))) { throw 'Served QR library is stale' }
$servedPage = (Invoke-WebRequest ($base + '/v4/') -UseBasicParsing).Content
if ($servedPage -ne [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'web\v4\index.html'))) { throw 'Served page is stale' }
foreach ($icon in @('icon-32.png','icon-180.png')) {
    $servedIcon = (Invoke-WebRequest ($base + '/' + $icon) -UseBasicParsing).Content
    $sourceIcon = [IO.File]::ReadAllBytes((Join-Path $PSScriptRoot ('web\' + $icon)))
    if ($servedIcon.Length -ne $sourceIcon.Length) { throw ('Served icon is stale: ' + $icon) }
}
Write-Host 'PASS served page and JavaScript match source'
Assert-Status '/api/v3/state' 401 @{}
Assert-Status '/api/v3/state' 200 $headers
$privateDeck = Invoke-RestMethod ($base + '/api/v3/deck') -Headers $adminHeaders
if ($privateDeck.schemaVersion -ne 3 -or !$privateDeck.version -or !$privateDeck.deck) { throw 'Admin v3 deck response missing or invalid' }
$privateDeckBody = @{ baseVersion = $privateDeck.version; deck = $privateDeck.deck } | ConvertTo-Json -Depth 100 -Compress
Assert-Status '/api/v3/deck' 200 $adminHeaders 'POST' $privateDeckBody
Write-Host 'PASS admin v3 deck can be read and saved unchanged'
Assert-Status '/api/ping' 401 @{ Authorization = 'Bearer ABCDEFGHJKLM' }
Write-Host 'PASS long key works and removed 12-character key is rejected'
$state = Invoke-RestMethod ($base + '/api/v3/state') -Headers $headers
if ($state.schemaVersion -ne 3 -or !$state.deck.landscape -or !$state.deck.portrait) { throw 'V3 deck state missing or invalid' }
Write-Host 'PASS v3 deck state is available to paired devices'
if ([string]::IsNullOrWhiteSpace($state.version)) { throw 'State version missing' }
if ($state.appVersion -notmatch '^4\.0(?:\+(?:[0-9a-f]{7,40}\.dirty|source|unknown))?$') { throw ('Unexpected app version: ' + $state.appVersion) }
if (@($state.widgetDefinitions).Count -ne 13) { throw 'Widget definitions missing or duplicated' }
foreach ($orientation in @($state.deck.landscape, $state.deck.portrait)) {
    foreach ($app in @($orientation.items)) {
        if ($app.PSObject.Properties.Name -contains 'path' -or $app.PSObject.Properties.Name -contains 'args' -or $app.PSObject.Properties.Name -contains 'url' -or $app.PSObject.Properties.Name -contains 'text') {
        throw 'Private action field leaked into phone state'
        }
    }
}
if (!$state.audio.speakerAvailable -or $state.audio.speakerVolume -lt 0 -or $state.audio.speakerVolume -gt 100) { throw 'Speaker state missing or invalid' }
if ($null -eq $state.metrics -or @($state.metrics.history).Count -gt 30) { throw 'Metrics state missing or history is unbounded' }
if ($state.metrics.memoryAvailable -and ($state.metrics.memoryPercent -lt 0 -or $state.metrics.memoryPercent -gt 100)) { throw 'Memory usage is out of range' }
if ($state.metrics.cpuAvailable -and ($state.metrics.cpuPercent -lt 0 -or $state.metrics.cpuPercent -gt 100)) { throw 'CPU usage is out of range' }
if ($null -eq $state.weather -or $state.weather.attribution -notmatch 'Open-Meteo') { throw 'Weather state or attribution is missing' }
foreach ($gpu in @($state.metrics.gpus)) {
    if ([string]::IsNullOrWhiteSpace($gpu.id) -or [string]::IsNullOrWhiteSpace($gpu.name)) { throw 'GPU identity is missing' }
    if ($gpu.utilizationAvailable -and ($gpu.utilizationPercent -lt 0 -or $gpu.utilizationPercent -gt 100)) { throw 'GPU usage is out of range' }
    if ($gpu.memoryAvailable -and ($gpu.memoryUsedBytes -gt $gpu.memoryTotalBytes)) { throw 'GPU memory usage is out of range' }
}
$cachedState = Invoke-RestMethod ($base + '/api/v3/state?version=' + $state.version) -Headers $headers
if ($null -ne $cachedState.deck) { throw 'Unchanged state repeated deck payload' }
Write-Host 'PASS private fields and unchanged-state payload cache'
$audioBody = @{ target = 'speaker'; volume = [int]$state.audio.speakerVolume } | ConvertTo-Json -Compress
Assert-Status '/api/audio' 200 $headers 'POST' $audioBody
Assert-Status '/api/audio' 400 $headers 'POST' '{"target":"unknown","volume":50}'
Assert-Status '/api/page' 200 $headers 'POST' '{"page":0}'
Assert-Status '/api/page' 400 $headers 'POST' '{"page":"invalid"}'
Assert-Status '/api/import' 403 $headers 'POST' '{}'
Assert-Status '/api/action' 400 $headers 'POST' '{"action":"launch","id":"missing-test-app"}'
Assert-Status '/api/action' 400 $headers 'POST' '{"action":"arbitrary-command"}'
Assert-Status '/data/settings.json' 404 $headers
Assert-Status '/data/settings-v2.json' 404 $headers
Assert-Status '/data/settings-v3.json' 404 $headers
$p = Get-Process TaPoard
$cpuStart = $p.TotalProcessorTime.TotalSeconds
Start-Sleep -Seconds 5
$p.Refresh()
[pscustomobject]@{ WorkingSetMB = [math]::Round($p.WorkingSet64 / 1MB, 1); PrivateMB = [math]::Round($p.PrivateMemorySize64 / 1MB, 1); IdleCpuSecondsOver5Seconds = [math]::Round($p.TotalProcessorTime.TotalSeconds - $cpuStart, 4) } | Format-List
