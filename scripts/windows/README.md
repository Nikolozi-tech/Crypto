# Windows 11 Safe Optimization Script

PowerShell maintenance script for a **conservative** cleanup on Windows 11:

1. Removes contents of user/system temp folders (skips locked files)
2. Clears the Windows Update **download** cache (`SoftwareDistribution\Download`)
3. Flushes the DNS client cache

It does **not** disable services, edit the registry, uninstall software, or delete Documents/Downloads/browser profiles.

> This repository runs in a Linux cloud environment, so the script cannot analyze your PC from here. Run it **on your Windows 11 machine** to get a local disk/OS snapshot and perform cleanup.

## Requirements

- Windows 10/11
- PowerShell 5.1+ (built into Windows 11)
- **Administrator** elevation for the Windows Update cache step (and for cleaning `C:\Windows\Temp` fully)

## How to run

1. Copy `Optimize-Windows11Safe.ps1` to your PC (e.g. `Downloads`).
2. Right-click **Windows PowerShell** → **Run as administrator**.
3. Allow script execution for this session only:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
cd $env:USERPROFILE\Downloads
.\Optimize-Windows11Safe.ps1
```

### Dry run (recommended first)

```powershell
.\Optimize-Windows11Safe.ps1 -DryRun
```

### Skip confirmation prompt

```powershell
.\Optimize-Windows11Safe.ps1 -SkipConfirm
```

## What gets cleaned

| Target | Path / action |
|--------|----------------|
| User TEMP | `%TEMP%` |
| LocalAppData Temp | `%LOCALAPPDATA%\Temp` |
| Windows Temp | `%SystemRoot%\Temp` |
| Recent shortcuts | `%APPDATA%\Microsoft\Windows\Recent` (shortcuts only) |
| WU download cache | `%SystemRoot%\SoftwareDistribution\Download` (services stopped briefly, then restarted) |
| DNS cache | `Clear-DnsClientCache` (fallback: `ipconfig /flushdns`) |

A transcript log is written under `%TEMP%\Win11SafeOptimize-*.log`.

## Safety notes

- Files in use are skipped; that is normal.
- Windows Update services (`wuauserv`, `bits`) are stopped only for the cache clear, then started again.
- After clearing the WU cache, open **Settings → Windows Update → Check for updates** so Windows can re-fetch needed packages.
- For deeper cleanup, use built-in **Storage sense** or `cleanmgr` rather than third-party “optimizer” tools.
