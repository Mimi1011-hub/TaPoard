$ErrorActionPreference = 'Stop'
foreach ($name in @('TaPoard-LAN-HTTP','TaPoard-LAN-mDNS')) {
    if (Get-NetFirewallRule -Name $name -ErrorAction SilentlyContinue) { Remove-NetFirewallRule -Name $name -ErrorAction Stop }
}
