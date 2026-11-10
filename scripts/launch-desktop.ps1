param([switch]$NoOpenBrowser, [scriptblock]$OnProgress)
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$artifacts = Join-Path $projectRoot 'artifacts'
$url = 'http://localhost:5174/'
if (-not $NoOpenBrowser -and -not $OnProgress) {
    . (Join-Path $PSScriptRoot 'startup_window.ps1')
    $opened = Show-TangerineStartup -AppName 'TangerineReadingCompanion' -ServiceLauncher $PSCommandPath `
        -StartupParameters @{NoOpenBrowser=$true} -OnReady { Start-Process $url }
    if (-not $opened) { exit 1 }
    exit 0
}
function Report-StartupProgress([string]$Stage) {
    if ($OnProgress) { & $OnProgress $Stage | Out-Null }
    else { Write-Host "Startup: $Stage" }
}
Report-StartupProgress 'checking-files'
$mutex = [System.Threading.Mutex]::new($false, 'Local\TangerineReadingCompanionLauncher')
$locked = $false
$startedServer = $null
$selected = $null

function Test-ReaderServer {
    try {
        $response = Invoke-WebRequest -Uri ($url + '__reading_review') -UseBasicParsing -TimeoutSec 2
        $identity = $response.Content | ConvertFrom-Json
        if ($identity.format -ne 'reading-review-v1' -or $identity.manifestHash -ne $selected.manifestHash) { return $false }
        $owner = Get-CimInstance Win32_Process -Filter ("ProcessId=" + [int]$identity.pid) -ErrorAction Stop
        $expectedScript = Join-Path $projectRoot 'scripts\serve-review.mjs'
        if (-not $owner -or $owner.CommandLine -notlike ('*"' + $expectedScript + '"*')) { return $false }
        $listeners = @(Get-NetTCPConnection -LocalPort 5174 -State Listen -ErrorAction Stop)
        if (-not ($listeners | Where-Object OwningProcess -eq $identity.pid)) { return $false }
        $page = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
        return $page.Content.Contains('content="' + $selected.manifestHash + '"')
    } catch { return $false }
}

try {
    New-Item -ItemType Directory -Force -Path $artifacts | Out-Null
    Report-StartupProgress 'waiting-lock'
    try { $locked = $mutex.WaitOne(30000) }
    catch [System.Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'Another launcher is still starting. Try again shortly.' }

    Report-StartupProgress 'checking-service'
    $selectionPath = Join-Path $artifacts 'review\selected.json'
    if (-not (Test-Path -LiteralPath $selectionPath)) { throw 'No verified desktop review is selected. See docs/development.md; npm run dev remains available for development.' }
    $selected = Get-Content -LiteralPath $selectionPath -Raw | ConvertFrom-Json
    if (-not (Test-ReaderServer)) {
        if (Get-NetTCPConnection -LocalPort 5174 -State Listen -ErrorAction SilentlyContinue) {
            throw 'Port 5174 belongs to another service. Close that service and try again; the reader will not change its data origin.'
        }
        $node = (Get-Command node.exe -ErrorAction Stop).Source
        $server = Join-Path $projectRoot 'scripts\serve-review.mjs'
        Report-StartupProgress 'starting-review'
        $startedServer = Start-Process -FilePath $node -ArgumentList @("`"$server`"") -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $artifacts 'launcher-server.log') -RedirectStandardError (Join-Path $artifacts 'launcher-server-error.log') -PassThru
        Report-StartupProgress 'waiting-review'
        $ready = $false
        for ($attempt = 0; $attempt -lt 40; $attempt++) {
            if (Test-ReaderServer) { $ready = $true; break }
            if ($startedServer.HasExited) { throw 'The local server exited. See artifacts/launcher-server-error.log.' }
            Start-Sleep -Milliseconds 250
        }
        if (-not $ready) { throw 'The local reader server did not become ready in time.' }
    }
    Report-StartupProgress 'ready'
    if (-not $NoOpenBrowser) { Start-Process $url }
} catch {
    $_.Exception.Message | Set-Content -LiteralPath (Join-Path $artifacts 'launcher-error.log') -Encoding UTF8
    throw
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
