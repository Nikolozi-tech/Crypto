<#
.SYNOPSIS
    Safe Windows 11 cleanup: temp files, Windows Update download cache, DNS cache.

.DESCRIPTION
    Conservative maintenance script. It does NOT:
      - Disable services permanently
      - Edit the registry
      - Uninstall apps or optional features
      - Clear browser profiles, Documents, Downloads, or user data
      - Touch System32 beyond standard cache commands

    Run in an elevated PowerShell session for full effect:
      Right-click PowerShell -> Run as administrator
      Set-ExecutionPolicy -Scope Process Bypass
      .\Optimize-Windows11Safe.ps1

.PARAMETER DryRun
    Report what would be cleaned without deleting anything.

.PARAMETER SkipConfirm
    Skip the interactive confirmation prompt (still requires elevation for WU cache).

.PARAMETER LogPath
    Optional path for a transcript log. Default: %TEMP%\Win11SafeOptimize-yyyyMMdd-HHmmss.log
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [switch]$DryRun,
    [switch]$SkipConfirm,
    [string]$LogPath
)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'

function Write-Step {
    param([string]$Message, [ValidateSet('Info', 'Ok', 'Warn', 'Err')][string]$Level = 'Info')
    $color = switch ($Level) {
        'Ok'   { 'Green' }
        'Warn' { 'Yellow' }
        'Err'  { 'Red' }
        default { 'Cyan' }
    }
    $prefix = switch ($Level) {
        'Ok'   { '[ OK ]' }
        'Warn' { '[WARN]' }
        'Err'  { '[ERR ]' }
        default { '[INFO]' }
    }
    Write-Host "$prefix $Message" -ForegroundColor $color
}

function Test-IsAdmin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($id)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-FolderSizeBytes {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return 0 }
    try {
        $sum = (Get-ChildItem -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue |
            Where-Object { -not $_.PSIsContainer } |
            Measure-Object -Property Length -Sum).Sum
        if ($null -eq $sum) { return 0 }
        return [int64]$sum
    }
    catch {
        return 0
    }
}

function Format-Bytes {
    param([int64]$Bytes)
    if ($Bytes -lt 1KB) { return "$Bytes B" }
    if ($Bytes -lt 1MB) { return ("{0:N1} KB" -f ($Bytes / 1KB)) }
    if ($Bytes -lt 1GB) { return ("{0:N1} MB" -f ($Bytes / 1MB)) }
    return ("{0:N2} GB" -f ($Bytes / 1GB))
}

function Get-DiskSnapshot {
    Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" -ErrorAction SilentlyContinue |
        Select-Object DeviceID,
            @{N = 'SizeGB'; E = { [math]::Round($_.Size / 1GB, 2) } },
            @{N = 'FreeGB'; E = { [math]::Round($_.FreeSpace / 1GB, 2) } },
            @{N = 'UsedPct'; E = {
                if ($_.Size -gt 0) {
                    [math]::Round((($_.Size - $_.FreeSpace) / $_.Size) * 100, 1)
                }
                else { 0 }
            } }
}

function Remove-DirectoryContentsSafe {
    param(
        [Parameter(Mandatory)][string]$Path,
        [string]$Label,
        [switch]$WhatIfOnly
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        Write-Step "$Label — path not found, skipped: $Path" 'Warn'
        return [pscustomobject]@{ Label = $Label; Path = $Path; FreedBytes = 0; Errors = 0 }
    }

    $before = Get-FolderSizeBytes -Path $Path
    $errors = 0

    if ($WhatIfOnly) {
        Write-Step "$Label — would clean ~$(Format-Bytes $before) from $Path" 'Info'
        return [pscustomobject]@{ Label = $Label; Path = $Path; FreedBytes = $before; Errors = 0 }
    }

    Write-Step "$Label — cleaning $Path ($(Format-Bytes $before))..." 'Info'
    Get-ChildItem -LiteralPath $Path -Force -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction Stop
        }
        catch {
            $errors++
            # Locked files (in use by apps/OS) are expected; skip quietly after counting.
        }
    }

    $after = Get-FolderSizeBytes -Path $Path
    $freed = [math]::Max(0, $before - $after)
    if ($errors -gt 0) {
        Write-Step "$Label — freed $(Format-Bytes $freed); $errors item(s) locked/skipped" 'Warn'
    }
    else {
        Write-Step "$Label — freed $(Format-Bytes $freed)" 'Ok'
    }

    return [pscustomobject]@{ Label = $Label; Path = $Path; FreedBytes = $freed; Errors = $errors }
}

# --- Banner / analysis (local machine only) ---
Write-Host ''
Write-Host '=== Windows 11 Safe Optimization ===' -ForegroundColor White
Write-Host 'Temp files | Windows Update download cache | DNS cache'
Write-Host ''

$os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
$cs = Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue
$isAdmin = Test-IsAdmin

Write-Step ("Computer : {0}" -f $(if ($cs) { $cs.Name } else { $env:COMPUTERNAME }))
Write-Step ("OS       : {0}" -f $(if ($os) { $os.Caption } else { 'Unknown' }))
Write-Step ("User     : {0}" -f $env:USERNAME)
Write-Step ("Elevated : {0}" -f $(if ($isAdmin) { 'Yes' } else { 'No (WU cache clear limited)' })) $(if ($isAdmin) { 'Ok' } else { 'Warn' })
Write-Step ("Mode     : {0}" -f $(if ($DryRun) { 'Dry run (no deletes)' } else { 'Live cleanup' }))

Write-Host ''
Write-Host 'Disk free space (before):' -ForegroundColor White
$beforeDisk = Get-DiskSnapshot
$beforeDisk | Format-Table -AutoSize | Out-String | Write-Host

if (-not $LogPath) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $LogPath = Join-Path $env:TEMP "Win11SafeOptimize-$stamp.log"
}

try {
    Start-Transcript -Path $LogPath -Append -ErrorAction SilentlyContinue | Out-Null
}
catch { }

if (-not $SkipConfirm -and -not $DryRun) {
    Write-Host 'This will remove temporary files and (if elevated) the Windows Update download cache,' -ForegroundColor Yellow
    Write-Host 'then flush the DNS resolver cache. User documents and installed apps are not touched.' -ForegroundColor Yellow
    $answer = Read-Host 'Continue? (Y/N)'
    if ($answer -notmatch '^(Y|y|Yes|yes)$') {
        Write-Step 'Cancelled by user.' 'Warn'
        try { Stop-Transcript -ErrorAction SilentlyContinue | Out-Null } catch { }
        exit 0
    }
}

$results = @()
$totalFreed = [int64]0

# ---------------------------------------------------------------------------
# 1) Temporary files (user + system TEMP)
# ---------------------------------------------------------------------------
Write-Host ''
Write-Host '--- Temporary files ---' -ForegroundColor White

$userTemp = $env:TEMP
$localTemp = Join-Path $env:LOCALAPPDATA 'Temp'
$winTemp = Join-Path $env:SystemRoot 'Temp'

foreach ($entry in @(
        @{ Path = $userTemp; Label = 'User TEMP' },
        @{ Path = $localTemp; Label = 'LocalAppData Temp' },
        @{ Path = $winTemp; Label = 'Windows\Temp' }
    )) {
    # Avoid double-cleaning if TEMP and LocalAppData\Temp resolve to the same folder.
    if ($results | Where-Object { $_.Path -eq $entry.Path }) { continue }
    $r = Remove-DirectoryContentsSafe -Path $entry.Path -Label $entry.Label -WhatIfOnly:$DryRun
    $results += $r
    $totalFreed += $r.FreedBytes
}

# Recent items shortcuts only (not the actual files)
$recent = Join-Path $env:APPDATA 'Microsoft\Windows\Recent'
if (Test-Path -LiteralPath $recent) {
    $r = Remove-DirectoryContentsSafe -Path $recent -Label 'Recent shortcuts' -WhatIfOnly:$DryRun
    $results += $r
    $totalFreed += $r.FreedBytes
}

# ---------------------------------------------------------------------------
# 2) Windows Update download cache (SoftwareDistribution\Download)
#    Safe pattern: stop wuauserv + bits, clear Download folder, restart services.
# ---------------------------------------------------------------------------
Write-Host ''
Write-Host '--- Windows Update download cache ---' -ForegroundColor White

$wuDownload = Join-Path $env:SystemRoot 'SoftwareDistribution\Download'
$wuServices = @('wuauserv', 'bits')
$stopped = @()

if (-not $isAdmin) {
    Write-Step 'Skipping Windows Update cache — re-run as Administrator for this step.' 'Warn'
}
elseif (-not (Test-Path -LiteralPath $wuDownload)) {
    Write-Step "Windows Update download folder not found: $wuDownload" 'Warn'
}
else {
    $wuBefore = Get-FolderSizeBytes -Path $wuDownload

    if ($DryRun) {
        Write-Step "Would stop BITS/Windows Update, clear ~$(Format-Bytes $wuBefore), then restart services." 'Info'
        $results += [pscustomobject]@{ Label = 'WU Download cache'; Path = $wuDownload; FreedBytes = $wuBefore; Errors = 0 }
        $totalFreed += $wuBefore
    }
    else {
        foreach ($svcName in $wuServices) {
            $svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
            if ($svc -and $svc.Status -eq 'Running') {
                try {
                    Stop-Service -Name $svcName -Force -ErrorAction Stop
                    $stopped += $svcName
                    Write-Step "Stopped service: $svcName" 'Ok'
                }
                catch {
                    Write-Step "Could not stop $svcName — cache clear may be partial. $($_.Exception.Message)" 'Warn'
                }
            }
        }

        # Brief settle time so file locks release.
        Start-Sleep -Seconds 2

        $r = Remove-DirectoryContentsSafe -Path $wuDownload -Label 'WU Download cache' -WhatIfOnly:$false
        $results += $r
        $totalFreed += $r.FreedBytes

        foreach ($svcName in $wuServices) {
            try {
                Start-Service -Name $svcName -ErrorAction Stop
                Write-Step "Started service: $svcName" 'Ok'
            }
            catch {
                # Only attempt restart for services we stopped or that exist.
                Write-Step "Could not start $svcName. Start it from services.msc if needed. $($_.Exception.Message)" 'Warn'
            }
        }
    }
}

# ---------------------------------------------------------------------------
# 3) DNS client cache
# ---------------------------------------------------------------------------
Write-Host ''
Write-Host '--- DNS cache ---' -ForegroundColor White

if ($DryRun) {
    Write-Step 'Would run: Clear-DnsClientCache / ipconfig /flushdns' 'Info'
}
else {
    $dnsOk = $false
    try {
        Clear-DnsClientCache -ErrorAction Stop
        $dnsOk = $true
        Write-Step 'DNS client cache cleared (Clear-DnsClientCache).' 'Ok'
    }
    catch {
        try {
            $out = & ipconfig /flushdns 2>&1 | Out-String
            if ($LASTEXITCODE -eq 0 -or $out -match 'successfully') {
                $dnsOk = $true
                Write-Step 'DNS resolver cache flushed (ipconfig /flushdns).' 'Ok'
            }
            else {
                Write-Step "DNS flush may have failed: $out" 'Warn'
            }
        }
        catch {
            Write-Step "DNS flush failed: $($_.Exception.Message)" 'Err'
        }
    }

    if ($dnsOk) {
        $results += [pscustomobject]@{ Label = 'DNS cache'; Path = 'N/A'; FreedBytes = 0; Errors = 0 }
    }
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
Write-Host ''
Write-Host '=== Summary ===' -ForegroundColor White
Write-Step ("Estimated space reclaimed: {0}" -f (Format-Bytes $totalFreed)) $(if ($DryRun) { 'Info' } else { 'Ok' })
if ($DryRun) {
    Write-Step 'Dry run only — nothing was deleted. Re-run without -DryRun to apply.' 'Warn'
}

Write-Host ''
Write-Host 'Disk free space (after):' -ForegroundColor White
$afterDisk = Get-DiskSnapshot
$afterDisk | Format-Table -AutoSize | Out-String | Write-Host

Write-Host 'Per-target results:' -ForegroundColor White
$results | Select-Object Label, Path,
    @{N = 'Freed'; E = { Format-Bytes $_.FreedBytes } },
    Errors |
    Format-Table -AutoSize | Out-String | Write-Host

Write-Step "Log file: $LogPath" 'Info'
Write-Host ''
Write-Host 'Safe next steps (optional, manual):' -ForegroundColor White
Write-Host '  • Settings > System > Storage > Temporary files'
Write-Host '  • Disk Cleanup (cleanmgr) as Administrator — include Windows Update Cleanup'
Write-Host '  • Settings > Windows Update > Check for updates (after WU cache clear)'
Write-Host ''

try { Stop-Transcript -ErrorAction SilentlyContinue | Out-Null } catch { }

exit 0
