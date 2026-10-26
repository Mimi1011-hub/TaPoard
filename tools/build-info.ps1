param([Parameter(Mandatory = $true)][string]$OutputPath)

$ErrorActionPreference = 'Stop'
$revision = 'unknown'
try {
    $candidate = (& git rev-parse --short=12 HEAD 2>$null).Trim()
    if ($candidate -match '^[0-9a-fA-F]{7,40}$') { $revision = $candidate.ToLowerInvariant() }
    # Only build inputs count, including new untracked files; doc/ and review/ do not.
    $root = Split-Path -Parent $PSScriptRoot
    $dirty = & git -C $root status --porcelain --untracked-files=all -- src web installer packaging tools build.ps1 package.ps1 2>$null
    if ($dirty) { $revision += '.dirty' }
} catch {
    $revision = 'unknown'
}
$displayVersion = '2.0-dev+' + $revision
$source = "using System.Reflection;`r`n[assembly: AssemblyInformationalVersion(`"$displayVersion`")]`r`n"
$parent = Split-Path -Parent $OutputPath
if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
[IO.File]::WriteAllText($OutputPath, $source, [Text.UTF8Encoding]::new($false))
[pscustomobject]@{ Path = $OutputPath; DisplayVersion = $displayVersion; Revision = $revision }
