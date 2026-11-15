$ErrorActionPreference = 'Stop'
$logPath = Join-Path $env:TEMP 'TaPoard-install.log'
$japanese = (Get-UICulture).Name -like 'ja*'
function Text([string]$ja, [string]$en) { if ($japanese) { $ja } else { $en } }
function Write-InstallLog([string]$message) {
    try { Add-Content -LiteralPath $logPath -Encoding UTF8 -Value ((Get-Date -Format s) + ' firewall ' + $message) } catch {}
}
try {
    $optionsPath = Join-Path $PSScriptRoot 'network.json'
    $program = Join-Path $PSScriptRoot 'TaPoard.exe'
    if (!(Test-Path -LiteralPath $optionsPath)) { throw (Text 'TaPoardを一度起動してから、もう一度セットアップしてください。' 'Start TaPoard once, then run setup again.') }
    if (!(Test-Path -LiteralPath $program)) { throw (Text 'TaPoard.exeが見つかりません。' 'TaPoard.exe was not found.') }
    $options = [IO.File]::ReadAllText($optionsPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
    $adapter = Get-NetAdapter -ErrorAction Stop | Where-Object { $_.InterfaceGuid.ToString().Trim('{}') -eq $options.interfaceId.Trim('{}') } | Select-Object -First 1
    if (!$adapter) { throw ((Text '使用するLANアダプターが見つかりません。識別子: ' 'The LAN adapter was not found. ID: ') + $options.interfaceId) }
    Write-InstallLog ('adapter=' + $adapter.Name + ' program=' + $program)
    foreach ($entry in @(@{Name='TaPoard-LAN-HTTP';Protocol='TCP';Port=18781}, @{Name='TaPoard-LAN-mDNS';Protocol='UDP';Port=5353})) {
        Get-NetFirewallRule -Name $entry.Name -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction Stop
        New-NetFirewallRule -Name $entry.Name -DisplayName $entry.Name -Direction Inbound -Action Allow -Profile Any -Program $program -InterfaceAlias $adapter.Name -RemoteAddress LocalSubnet -Protocol $entry.Protocol -LocalPort $entry.Port -ErrorAction Stop | Out-Null
        if (!(Get-NetFirewallRule -Name $entry.Name -ErrorAction SilentlyContinue)) { throw ($entry.Name + (Text 'を確認できませんでした。' ' could not be verified.')) }
        Write-InstallLog ('created ' + $entry.Name + ' ' + $entry.Protocol + '/' + $entry.Port)
    }
    # Cancelling the Windows "allow access" prompt leaves block rules for this exe, and block
    # rules win over allow rules. Remove only inbound block rules that name this exact program.
    $blocks = @(Get-NetFirewallApplicationFilter -Program $program -ErrorAction SilentlyContinue | Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.Direction -eq 'Inbound' -and $_.Action -eq 'Block' })
    foreach ($block in $blocks) {
        Remove-NetFirewallRule -Name $block.Name -ErrorAction Stop
        Write-InstallLog ('removed block rule ' + $block.DisplayName)
    }
    Write-InstallLog 'completed'
    Write-Host ((Text 'TaPoardのLAN接続を許可しました: ' 'Allowed TaPoard LAN access: ') + 'http://' + $options.hostName + ':18781/')
    exit 0
} catch {
    $detail = ($_ | Out-String).Trim()
    Write-InstallLog ('ERROR ' + $detail)
    Write-Error $detail
    exit 1
}
