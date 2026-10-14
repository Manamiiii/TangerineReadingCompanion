$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$artifacts = Join-Path $projectRoot 'artifacts'
$url = 'http://localhost:5174/'
$mutex = [System.Threading.Mutex]::new($false, 'Local\TangerineReadingCompanionLauncher')
$locked = $false
$startedServer = $null

function Test-ReaderServer {
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
        return $response.Content -match '<title>Tangerine Reading Companion</title>'
    } catch { return $false }
}

try {
    New-Item -ItemType Directory -Force -Path $artifacts | Out-Null
    try { $locked = $mutex.WaitOne(30000) }
    catch [System.Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'Another launcher is still starting. Try again shortly.' }

    if (-not (Test-ReaderServer)) {
        if (Get-NetTCPConnection -LocalPort 5174 -State Listen -ErrorAction SilentlyContinue) {
            throw 'Port 5174 belongs to another service. Close that service and try again; the reader will not change its data origin.'
        }
        $node = (Get-Command node.exe -ErrorAction Stop).Source
        $vite = Join-Path $projectRoot 'node_modules\vite\bin\vite.js'
        if (-not (Test-Path -LiteralPath $vite)) { throw 'Project dependencies are missing. Run npm install in the project folder first.' }
        $startedServer = Start-Process -FilePath $node -ArgumentList @("`"$vite`"", '--host', 'localhost', '--port', '5174', '--strictPort') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $artifacts 'launcher-server.log') -RedirectStandardError (Join-Path $artifacts 'launcher-server-error.log') -PassThru
        $ready = $false
        for ($attempt = 0; $attempt -lt 40; $attempt++) {
            if (Test-ReaderServer) { $ready = $true; break }
            if ($startedServer.HasExited) { throw 'The local server exited. See artifacts/launcher-server-error.log.' }
            Start-Sleep -Milliseconds 250
        }
        if (-not $ready) { throw 'The local reader server did not become ready in time.' }
    }
    Start-Process $url
} catch {
    if ($startedServer -and -not $startedServer.HasExited) { $startedServer.Kill() }
    $_.Exception.Message | Set-Content -LiteralPath (Join-Path $artifacts 'launcher-error.log') -Encoding UTF8
    exit 1
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
