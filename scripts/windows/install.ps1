# Motion Arena – automatische Installation für Windows (ohne Administratorrechte).
# Wird von "Installieren.bat" aufgerufen. Erneut ausführen = aktualisieren.
param(
  [string]$ToolsDir = (Join-Path $env:LOCALAPPDATA "MotionArena\tools"),
  [string]$ShortcutDir = [Environment]::GetFolderPath("Desktop"),
  [switch]$Yes,                # alle Fragen mit Standard beantworten (für Tests/Automatisierung)
  [switch]$NoShortcut,
  [switch]$NoFirewall,
  [switch]$ForceNodeDownload   # eigene Node.js-Kopie laden, auch wenn eine passende installiert ist
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}

$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$MinNodeMajor = 22
$Steps = 6

function Step($n, $text) { Write-Host ""; Write-Host "[$n/$Steps] $text" -ForegroundColor Cyan }
function Ok($text) { Write-Host "      $text" -ForegroundColor Green }
function Info($text) { Write-Host "      $text" }
function Ask($question) {
  if ($Yes) { return $true }
  $a = Read-Host "      $question [J/n]"
  return ($a -eq "" -or $a -match "^[jJyY]")
}
function Invoke-Native($exe, [string[]]$arguments) {
  & $exe @arguments
  if ($LASTEXITCODE -ne 0) { throw "Befehl fehlgeschlagen ($LASTEXITCODE): $exe $($arguments -join ' ')" }
}
function Get-NodeMajor($nodeExe) {
  try { $v = & $nodeExe -v; if ($v -match "^v(\d+)\.") { return [int]$Matches[1] } } catch {}
  return 0
}

Write-Host ""
Write-Host "  Motion Arena – Installation" -ForegroundColor White
Write-Host "  Projektordner: $Repo"
Write-Host "  Werkzeuge:     $ToolsDir"

try {
  New-Item -ItemType Directory -Force -Path $ToolsDir | Out-Null

  # ---------------------------------------------------------------- 1. Node.js
  Step 1 "Node.js prüfen"
  $nodeDir = Join-Path $ToolsDir "node"
  $nodeExe = $null
  if (-not $ForceNodeDownload) {
    $sys = Get-Command node -ErrorAction SilentlyContinue
    if ($sys -and (Get-NodeMajor $sys.Source) -ge $MinNodeMajor) {
      $nodeExe = $sys.Source
      Ok "Installiertes Node.js $(& $nodeExe -v) wird verwendet."
    }
  }
  if (-not $nodeExe -and (Test-Path (Join-Path $nodeDir "node.exe")) -and (Get-NodeMajor (Join-Path $nodeDir "node.exe")) -ge $MinNodeMajor) {
    $nodeExe = Join-Path $nodeDir "node.exe"
    Ok "Eigene Node.js-Kopie $(& $nodeExe -v) ist bereits vorhanden."
  }
  if (-not $nodeExe) {
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
    Info "Lade aktuelle Node.js-LTS-Version ($arch) von nodejs.org …"
    $index = Invoke-RestMethod "https://nodejs.org/dist/index.json"
    $rel = $index | Where-Object { $_.lts -and ($_.files -contains "win-$arch-zip") } | Select-Object -First 1
    if (-not $rel) { throw "Keine passende Node.js-Version für win-$arch gefunden." }
    $ver = $rel.version
    $zipName = "node-$ver-win-$arch.zip"
    $tmp = Join-Path $env:TEMP "motion-arena-node-$([guid]::NewGuid())"
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    $zip = Join-Path $tmp $zipName
    Invoke-WebRequest "https://nodejs.org/dist/$ver/$zipName" -OutFile $zip -UseBasicParsing
    $sums = Invoke-RestMethod "https://nodejs.org/dist/$ver/SHASUMS256.txt"
    $line = ($sums -split "`n") | Where-Object { $_ -match ("\s" + [regex]::Escape($zipName) + "\s*$") } | Select-Object -First 1
    $expected = ($line -split "\s+")[0].ToLower()
    $actual = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
    if (-not $expected -or $actual -ne $expected) { throw "Prüfsumme von $zipName stimmt nicht – Download abgebrochen." }
    Ok "Download $ver geprüft (SHA-256)."
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    if (Test-Path $nodeDir) { Remove-Item -Recurse -Force $nodeDir }
    Move-Item (Join-Path $tmp "node-$ver-win-$arch") $nodeDir
    Remove-Item -Recurse -Force $tmp
    $nodeExe = Join-Path $nodeDir "node.exe"
    Ok "Node.js $ver installiert (nur für Motion Arena, ohne Systemänderung)."
  }
  $nodeBin = Split-Path $nodeExe
  $env:PATH = "$nodeBin;$env:PATH"

  # ---------------------------------------------------------------- 2. pnpm
  Step 2 "pnpm einrichten"
  $pkg = Get-Content (Join-Path $Repo "package.json") -Raw | ConvertFrom-Json
  $pnpmVersion = ($pkg.packageManager -replace "^pnpm@", "")
  $pnpmDir = Join-Path $ToolsDir "pnpm"
  $pnpmCmd = Join-Path $pnpmDir "pnpm.cmd"
  $have = $null
  if (Test-Path $pnpmCmd) { try { $have = (& $pnpmCmd -v) } catch { $have = $null } }
  if ($have -ne $pnpmVersion) {
    Info "Installiere pnpm $pnpmVersion …"
    Invoke-Native (Join-Path $nodeBin "npm.cmd") @("install", "-g", "pnpm@$pnpmVersion", "--prefix", $pnpmDir, "--no-fund", "--no-audit", "--loglevel", "error")
  }
  $env:PATH = "$pnpmDir;$env:PATH"
  Ok "pnpm $(& $pnpmCmd -v) bereit."

  # ---------------------------------------------------------------- 3. Abhängigkeiten
  Step 3 "Abhängigkeiten installieren (beim ersten Mal 1–3 Minuten)"
  Push-Location $Repo
  try {
    Invoke-Native $pnpmCmd @("install", "--frozen-lockfile")
    Ok "Abhängigkeiten installiert."

    # -------------------------------------------------------------- 4. Bauen
    Step 4 "App bauen und Erkennungsmodelle laden"
    Invoke-Native $pnpmCmd @("build")
    Ok "App gebaut (apps/mobile-web/dist)."
  } finally { Pop-Location }

  # ---------------------------------------------------------------- 5. Firewall
  Step 5 "Firewall-Freigabe für das Handy"
  $rule = $null
  try { $rule = Get-NetFirewallRule -DisplayName "Motion Arena" -ErrorAction SilentlyContinue } catch {}
  if ($NoFirewall) {
    Info "Übersprungen."
  } elseif ($rule) {
    Ok "Freigabe ist bereits eingerichtet."
  } elseif (Ask "Damit das Handy den PC im Heimnetz erreicht, eine Firewall-Freigabe (Port 4443/5173, nur private Netzwerke) einrichten? Windows fragt dafür einmal nach Administratorrechten.") {
    try {
      $cmd = "New-NetFirewallRule -DisplayName 'Motion Arena' -Direction Inbound -Protocol TCP -LocalPort 4443,5173 -Action Allow -Profile Private | Out-Null"
      Start-Process powershell -Verb RunAs -Wait -ArgumentList @("-NoProfile", "-Command", $cmd)
      if (Get-NetFirewallRule -DisplayName "Motion Arena" -ErrorAction SilentlyContinue) { Ok "Freigabe eingerichtet." }
      else { Info "Freigabe wurde nicht eingerichtet. Windows fragt dann beim ersten Start nach." }
    } catch {
      Info "Freigabe abgelehnt oder nicht möglich. Windows fragt dann beim ersten Start nach."
    }
  } else {
    Info "Übersprungen. Windows fragt beim ersten Start ggf. selbst nach – dann 'Private Netzwerke' erlauben."
  }

  # ---------------------------------------------------------------- 6. Verknüpfung
  Step 6 "Desktop-Verknüpfung"
  if ($NoShortcut) {
    Info "Übersprungen."
  } else {
    New-Item -ItemType Directory -Force -Path $ShortcutDir | Out-Null
    $lnk = Join-Path $ShortcutDir "Motion Arena.lnk"
    $shell = New-Object -ComObject WScript.Shell
    $s = $shell.CreateShortcut($lnk)
    $s.TargetPath = Join-Path $Repo "Motion Arena starten.bat"
    $s.WorkingDirectory = $Repo
    $s.IconLocation = (Join-Path $Repo "scripts\windows\motion-arena.ico") + ",0"
    $s.Description = "Motion Arena starten und mit dem Handy verbinden"
    $s.Save()
    Ok "'Motion Arena' liegt jetzt auf dem Desktop."
  }

  Write-Host ""
  Write-Host "  Fertig! Zum Starten doppelt auf 'Motion Arena' (Desktop) klicken." -ForegroundColor Green
  Write-Host "  Dann den QR-Code mit dem Handy scannen."
  Write-Host ""
  exit 0
} catch {
  Write-Host ""
  Write-Host "  Installation fehlgeschlagen: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "  Hilfe: README → Installation → Fehlerbehebung"
  Write-Host ""
  exit 1
}
