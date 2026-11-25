# Motion Arena starten: HTTPS-Server im Heimnetz + QR-Code für das Handy.
# Wird von "Motion Arena starten.bat" bzw. der Desktop-Verknüpfung aufgerufen.
param(
  [string]$ToolsDir = (Join-Path $env:LOCALAPPDATA "MotionArena\tools"),
  [int]$Port = 4443,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
$Host.UI.RawUI.WindowTitle = "Motion Arena"
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

foreach ($d in @((Join-Path $ToolsDir "pnpm"), (Join-Path $ToolsDir "node"))) {
  if (Test-Path $d) { $env:PATH = "$d;$env:PATH" }
}
if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host "Motion Arena ist noch nicht installiert. Bitte zuerst 'Installieren.bat' doppelklicken." -ForegroundColor Red
  exit 1
}

Push-Location $Repo
try {
  if (-not (Test-Path "apps\mobile-web\dist\index.html")) {
    Write-Host "App wird gebaut …"
    pnpm build
    if ($LASTEXITCODE -ne 0) { throw "Bauen fehlgeschlagen." }
  }

  # Adressen dieses PCs im Netz: Heimnetz zuerst, virtuelle Adapter weglassen.
  $rank = {
    param($ip)
    if ($ip -like "192.168.*") { 0 }
    elseif ($ip -like "10.*") { 1 }
    elseif ($ip -match "^172\.(1[6-9]|2\d|3[01])\.") { 2 }
    elseif ($ip -match "^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.") { 3 }   # VPN wie Tailscale
    else { 4 }
  }
  $ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notmatch "^(127\.|169\.254\.)" -and
      $_.InterfaceAlias -notmatch "vEthernet|Loopback|WSL|VirtualBox|VMware|Hyper-V"
    } |
    Sort-Object { & $rank $_.IPAddress } |
    Select-Object -ExpandProperty IPAddress -Unique)
  $local = @($ips | ForEach-Object { "https://$($_):$Port/" })
  if ($local.Count -eq 0) { $local = @("https://localhost:$Port/") }
  # Empfohlen: öffentliche Adresse mit echtem Zertifikat – dort lässt sich die App installieren
  # und läuft danach ohne PC. Heimnetz-Adressen als Alternative (z. B. ohne Internet).
  $public = "https://youra82.github.io/motion_arena/?install=1"
  $urls = @($public) + $local

  Write-Host ""
  Write-Host "  Mit dem Handy diesen QR-Code scannen und die App installieren:" -ForegroundColor White
  $page = Join-Path $env:TEMP "motion-arena-verbinden.html"
  node scripts\windows\connect-page.mjs $page @urls
  Write-Host "  Empfohlen (installierbar, danach ohne PC): $public" -ForegroundColor Green
  Write-Host "  Im Heimnetz über diesen PC:                $($local -join '  ')"
  Write-Host "  Am PC selbst:                              https://localhost:$Port/"
  Write-Host ""
  Write-Host "  Dieses Fenster offen lassen – Schließen beendet Motion Arena." -ForegroundColor Yellow
  Write-Host ""
  if (-not $NoBrowser) { Start-Process $page }

  pnpm --filter "@motion-arena/mobile-web" exec vite preview --host --mode phone --port $Port --strictPort
} finally {
  Pop-Location
}
