$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:18781'
$config = [IO.File]::ReadAllText("$PSScriptRoot\dist\data\settings-v2.json", [Text.Encoding]::UTF8) | ConvertFrom-Json
if ($config.schemaVersion -ne 2) { throw 'Unexpected settings schema version' }
$headers = @{ Authorization = 'Bearer ' + $config.token }
$shortHeaders = @{ Authorization = 'Bearer ' + $config.pairingKey }
if ($config.pairingKey -notmatch '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$') { throw 'Short pairing key missing or invalid' }
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
Assert-Status '/' 200 @{}
Assert-Status '/style.css' 200 @{}
Assert-Status '/app.js' 200 @{}
Assert-Status '/qrcode.js' 200 @{}
Assert-Status '/nosleep.min.js' 200 @{}
Assert-Status '/manifest.webmanifest' 200 @{}
Assert-Status '/icon-32.png' 200 @{}
Assert-Status '/icon-180.png' 200 @{}
Assert-Status '/icon-192.png' 200 @{}
Assert-Status '/icon-512.png' 200 @{}
$servedScript = (Invoke-WebRequest ($base + '/app.js') -UseBasicParsing).Content
if ($servedScript -ne [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'web\app.js'))) { throw 'Served JavaScript is stale' }
$servedQrScript = (Invoke-WebRequest ($base + '/qrcode.js') -UseBasicParsing).Content
if ($servedQrScript -ne [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'web\qrcode.js'))) { throw 'Served QR library is stale' }
$servedPage = (Invoke-WebRequest $base -UseBasicParsing).Content
if ($servedPage -ne [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'web\index.html'))) { throw 'Served page is stale' }
foreach ($icon in @('icon-32.png','icon-180.png')) {
    $servedIcon = (Invoke-WebRequest ($base + '/' + $icon) -UseBasicParsing).Content
    $sourceIcon = [IO.File]::ReadAllBytes((Join-Path $PSScriptRoot ('web\' + $icon)))
    if ($servedIcon.Length -ne $sourceIcon.Length) { throw ('Served icon is stale: ' + $icon) }
}
Write-Host 'PASS served page and JavaScript match source'
if ($servedScript -notmatch 'row\.draggable\s*=\s*true' -or $servedScript -notmatch 'persistRows' -or $servedScript -notmatch 'clip-undo' -or $servedScript -notmatch 'clip-new-raster' -or $servedScript -notmatch 'clip-eyedropper' -or $servedScript -notmatch 'windows-printscreen' -or $servedScript -notmatch 'common-copy' -or $servedScript -notmatch 'audio-mic-mute' -or $servedScript -notmatch 'control-speaker-fader' -or $servedScript -notmatch 'control-mic-fader' -or $servedScript -notmatch 'audioFader' -or $servedScript -notmatch 'audioInteraction' -or $servedScript -notmatch 'widget-clock-digital' -or $servedScript -notmatch 'clock-widget' -or $servedScript -notmatch 'scheduleClockUpdates' -or $servedScript -notmatch 'labelOpacity' -or $servedScript -notmatch 'layout\.grids' -or $servedScript -notmatch 'message-hiding' -or $servedScript -notmatch 'displayGrid' -or $servedScript -notmatch 'drawPairQr' -or $servedScript -notmatch '#connect=' -or $servedScript -notmatch 'openDeckContextMenu' -or $servedScript -notmatch 'openAudioContextMenu' -or $servedScript -notmatch 'openIconPicker' -or $servedScript -notmatch 'useCustomIcon' -or $servedScript -notmatch 'customIcon' -or $servedScript -notmatch 'custom-url' -or $servedScript -notmatch 'custom-clipboard' -or $servedScript -notmatch "phone-panel'\)\.scrollIntoView") { throw 'Editor, shortcut, URL, clipboard, clock, save navigation, QR pairing, orientation, audio fader, custom icon picker, or context menu assets missing' }
if ($servedPage -notmatch 'id="preview-add"' -or $servedPage -notmatch 'id="preview-landscape"' -or $servedPage -notmatch 'id="preview-portrait"') { throw 'Preview quick-add or orientation controls missing' }
if ($servedPage -notmatch 'id="grid-columns"' -or $servedPage -notmatch 'nosleep.min.js' -or $servedPage -notmatch 'id="device-menu-button"' -or $servedPage -notmatch 'id="pair-qr-iphone"' -or $servedPage -notmatch 'id="pair-qr-android"' -or $servedPage -notmatch 'id="connection-panel"' -or $servedPage -notmatch 'id="phone-panel"' -or $servedPage -notmatch 'id="app-registration-panel"' -or $servedPage -notmatch 'class="quick-guide"' -or $servedPage -notmatch 'class="home-icon-guide"' -or $servedPage -notmatch 'id="icon-picker-backdrop"' -or $servedPage -notmatch 'id="custom-icon-file"' -or $servedPage -notmatch 'id="app-version"' -or $servedPage -notmatch 'id="add-url"' -or $servedPage -notmatch 'id="add-text"' -or $servedPage -match 'id="import-apps"' -or $servedPage -notmatch 'sizes="512x512"') { throw 'Grid, screen-awake, URL, clipboard, dual QR fallback, settings sections, quick guide, home icons, custom icon picker, version, or hamburger controls missing' }
Write-Host 'PASS editor, audio faders, adjustable grid, screen-awake fallback, and shortcut assets'
$presetBlock = [regex]::Match($servedScript, 'var presetGroups\s*=\s*\[(.*?)\];\s*var presetMap', [Text.RegularExpressions.RegexOptions]::Singleline).Groups[1].Value
$webIconKeys = @([regex]::Matches($presetBlock, "\['([^']+)',\s*'") | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
$serverIconSource = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'src\IconPresets.cs'))
$serverKeyBlock = [regex]::Match($serverIconSource, 'new HashSet<string>\(StringComparer\.Ordinal\)\{(.*?)\};', [Text.RegularExpressions.RegexOptions]::Singleline).Groups[1].Value
$serverIconKeys = @([regex]::Matches($serverKeyBlock, '"([a-z0-9-]+)"') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
if ($webIconKeys.Count -lt 70) { throw ('Too few icon presets: ' + $webIconKeys.Count) }
if (Compare-Object $webIconKeys $serverIconKeys) { throw 'Browser and server icon preset lists differ' }
Write-Host ('PASS ' + $webIconKeys.Count + ' selectable icon presets match the server allowlist')
Assert-Status '/api/state' 401 @{}
Assert-Status '/api/state' 200 $headers
Assert-Status '/api/state' 200 $shortHeaders
Write-Host 'PASS existing long key and 12-character pairing key'
$state = Invoke-RestMethod ($base + '/api/state') -Headers $headers
if ([string]::IsNullOrWhiteSpace($state.version)) { throw 'State version missing' }
if ($state.appVersion -notmatch '^2\.0-dev\+(?:[0-9a-f]{7,40}(?:\.dirty)?|source|unknown)$') { throw ('Unexpected app version: ' + $state.appVersion) }
if (@($state.widgetDefinitions).Count -ne 10) { throw 'Widget definitions missing or duplicated' }
foreach ($app in @($state.apps)) {
    if ($app.PSObject.Properties.Name -contains 'path' -or $app.PSObject.Properties.Name -contains 'args' -or $app.PSObject.Properties.Name -contains 'url' -or $app.PSObject.Properties.Name -contains 'text') {
        throw 'Private action field leaked into phone state'
    }
}
if (!$state.audio.speakerAvailable -or $state.audio.speakerVolume -lt 0 -or $state.audio.speakerVolume -gt 100) { throw 'Speaker state missing or invalid' }
if ($state.columns -lt 3 -or $state.rows -lt 2) { throw 'Grid settings missing or invalid' }
if (!$state.landscapeGrid -or !$state.portraitGrid) { throw 'Independent orientation grids missing' }
if ($state.speakerSlot -eq $state.micSlot -or $state.speakerSlot -lt 0 -or $state.micSlot -lt 0) { throw 'Audio control positions missing or invalid' }
$cachedState = Invoke-RestMethod ($base + '/api/state?version=' + $state.version) -Headers $headers
if ($null -ne $cachedState.apps) { throw 'Unchanged state repeated app/icon payload' }
foreach ($app in @($state.apps)) {
    if ($app.icon -and !$app.icon.StartsWith('data:image/png;base64,')) { throw 'Unexpected app icon format' }
}
Write-Host 'PASS app icons and unchanged-state payload cache'
$audioBody = @{ target = 'speaker'; volume = [int]$state.audio.speakerVolume } | ConvertTo-Json -Compress
Assert-Status '/api/audio' 200 $headers 'POST' $audioBody
Assert-Status '/api/audio' 400 $headers 'POST' '{"target":"unknown","volume":50}'
$layoutBody = @{ columns = [int]$state.columns; rows = [int]$state.rows; keepAwake = [bool]$state.keepAwake; speakerSlot = [int]$state.speakerSlot; micSlot = [int]$state.micSlot } | ConvertTo-Json -Compress
Assert-Status '/api/layout' 200 $headers 'POST' $layoutBody
Assert-Status '/api/layout' 400 $headers 'POST' '{"columns":2,"rows":1,"keepAwake":true}'
Assert-Status '/api/page' 200 $headers 'POST' '{"page":0}'
Assert-Status '/api/page' 400 $headers 'POST' '{"page":"invalid"}'
Assert-Status '/api/settings' 404 $headers
Assert-Status '/api/settings' 403 $headers 'POST' '{"apps":[]}'
Assert-Status '/api/import' 403 $headers 'POST' '{}'
Assert-Status '/api/action' 400 $headers 'POST' '{"action":"launch","id":"missing-test-app"}'
Assert-Status '/api/action' 400 $headers 'POST' '{"action":"arbitrary-command"}'
Assert-Status '/data/settings.json' 404 $headers
Assert-Status '/data/settings-v2.json' 404 $headers
$p = Get-Process TaPoard
$cpuStart = $p.TotalProcessorTime.TotalSeconds
Start-Sleep -Seconds 5
$p.Refresh()
[pscustomobject]@{ WorkingSetMB = [math]::Round($p.WorkingSet64 / 1MB, 1); PrivateMB = [math]::Round($p.PrivateMemorySize64 / 1MB, 1); IdleCpuSecondsOver5Seconds = [math]::Round($p.TotalProcessorTime.TotalSeconds - $cpuStart, 4) } | Format-List
