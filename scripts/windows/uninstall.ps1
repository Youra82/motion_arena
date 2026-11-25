# Motion Arena entfernen: Desktop-Verknüpfung, heruntergeladene Werkzeuge, Firewall-Freigabe.
# Der Projektordner selbst bleibt – ihn kann man danach einfach löschen.
param(
  [string]$ToolsDir = (Join-Path $env:LOCALAPPDATA "MotionArena\tools"),
  [string]$ShortcutDir = [Environment]::GetFolderPath("Desktop"),
  [switch]$Yes
)

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}

function Ask($q) { if ($Yes) { return $true }; $a = Read-Host "$q [J/n]"; return ($a -eq "" -or $a -match "^[jJyY]") }

Write-Host ""
Write-Host "  Motion Arena – Deinstallation" -ForegroundColor White
if (-not (Ask "  Verknüpfung, Werkzeuge ($ToolsDir) und Firewall-Freigabe entfernen?")) { exit 0 }

$lnk = Join-Path $ShortcutDir "Motion Arena.lnk"
if (Test-Path $lnk) { Remove-Item -Force $lnk; Write-Host "  Desktop-Verknüpfung entfernt." -ForegroundColor Green }

if (Test-Path $ToolsDir) {
  Remove-Item -Recurse -Force $ToolsDir
  $parent = Split-Path $ToolsDir
  if ((Split-Path $parent -Leaf) -eq "MotionArena" -and -not (Get-ChildItem $parent -Force)) { Remove-Item -Force $parent }
  Write-Host "  Werkzeuge entfernt (Node.js/pnpm nur für Motion Arena)." -ForegroundColor Green
}

if (Get-NetFirewallRule -DisplayName "Motion Arena" -ErrorAction SilentlyContinue) {
  try {
    Start-Process powershell -Verb RunAs -Wait -ArgumentList @("-NoProfile", "-Command", "Remove-NetFirewallRule -DisplayName 'Motion Arena'")
    Write-Host "  Firewall-Freigabe entfernt." -ForegroundColor Green
  } catch { Write-Host "  Firewall-Freigabe nicht entfernt (Administratorrechte abgelehnt)." }
}

$page = Join-Path $env:TEMP "motion-arena-verbinden.html"
if (Test-Path $page) { Remove-Item -Force $page }

Write-Host ""
Write-Host "  Fertig. Den Projektordner kannst du jetzt einfach löschen." -ForegroundColor Green
Write-Host ""
