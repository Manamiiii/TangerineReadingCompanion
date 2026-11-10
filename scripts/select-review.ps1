param([Parameter(Mandatory=$true)][string]$Snapshot)
$ErrorActionPreference = 'Stop'
if ($Snapshot -notmatch '^[a-f0-9]{40}-[a-f0-9]{12}$') { throw 'Invalid review snapshot name.' }
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$reviews = Join-Path $root 'artifacts\review'
$directory = Join-Path (Join-Path $reviews 'releases') $Snapshot
$manifest = Join-Path $directory 'review.json'
$hash = (Get-FileHash -LiteralPath $manifest -Algorithm SHA256).Hash.ToLowerInvariant()
$verification = Get-Content -LiteralPath (Join-Path $directory 'verified.json') -Raw | ConvertFrom-Json
if ($verification.manifestHash -ne $hash -or $verification.passed -ne $true) { throw 'Verify this snapshot in an isolated browser before selecting it.' }
$mutex = [Threading.Mutex]::new($false, 'Local\TangerineReadingCompanionLauncher')
$locked = $false
try {
    try { $locked = $mutex.WaitOne(30000) } catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'Another launcher is active; selection unchanged.' }
    if (Get-NetTCPConnection -LocalPort 5174 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 5174 is in use. Preserve active reading sessions; selection unchanged.' }
    $selection = Join-Path $reviews 'selected.json'
    $temporary = Join-Path $reviews ('selection-' + [guid]::NewGuid().ToString() + '.json')
    $text = @{directory=$Snapshot;manifestHash=$hash} | ConvertTo-Json
    [IO.File]::WriteAllText($temporary, $text, [Text.UTF8Encoding]::new($false))
    if (Test-Path -LiteralPath $selection) { [IO.File]::Replace($temporary, $selection, (Join-Path $reviews ('previous-' + [guid]::NewGuid().ToString() + '.json'))) }
    else { [IO.File]::Move($temporary, $selection) }
    Write-Output "Selected verified review: $Snapshot"
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
