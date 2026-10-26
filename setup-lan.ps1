# Run once as Administrator after starting TaPoard.
$ErrorActionPreference = 'Stop'
$options = Get-Content "$PSScriptRoot\dist\network.json" -Raw | ConvertFrom-Json
$adapter = Get-NetAdapter -ErrorAction Stop | Where-Object { $_.InterfaceGuid.ToString().Trim('{}') -eq $options.interfaceId.Trim('{}') } | Select-Object -First 1
if (!$adapter) { throw 'Configured LAN adapter not found' }
$program = Join-Path $PSScriptRoot 'dist\TaPoard.exe'
foreach ($entry in @(@{Name='TaPoard-LAN-HTTP';Protocol='TCP';Port=18781}, @{Name='TaPoard-LAN-mDNS';Protocol='UDP';Port=5353})) {
    Get-NetFirewallRule -Name $entry.Name -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction Stop
    New-NetFirewallRule -Name $entry.Name -DisplayName $entry.Name -Direction Inbound -Action Allow -Profile Any -Program $program -InterfaceAlias $adapter.Name -RemoteAddress LocalSubnet -Protocol $entry.Protocol -LocalPort $entry.Port -ErrorAction Stop | Out-Null
}
foreach ($oldName in @('StreamDeck-LAN-HTTP','StreamDeck-LAN-mDNS')) {
    Get-NetFirewallRule -Name $oldName -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction Stop
}
Write-Host ('LAN URL: http://' + $options.hostName + ':18781/')
