param([switch]$SetupOnly)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $root '.righttab-runtime'
$nodeVersion = '24.22.3'
$nodeFolder = "node-v$nodeVersion-win-x64"
$nodeDir = Join-Path $runtimeRoot $nodeFolder
$nodeExe = Join-Path $nodeDir 'node.exe'
$npmCmd = Join-Path $nodeDir 'npm.cmd'
$expectedSha256 = 'e612af99f626ab415ea225af6bce5c971feb448cb5cae250bb1c3fa50c5f7d9f'

try {
    if (-not [Environment]::Is64BitOperatingSystem) {
        throw 'RightTab requires a 64-bit version of Windows.'
    }
    if (-not (Test-Path -LiteralPath $nodeExe) -or -not (Test-Path -LiteralPath $npmCmd)) {
        Write-Host 'First run: downloading the local Node.js runtime...'
        New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
        $archive = Join-Path $runtimeRoot "$nodeFolder.zip"
        $staging = Join-Path $runtimeRoot 'node-staging'
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -Uri "https://nodejs.org/dist/v$nodeVersion/$nodeFolder.zip" -OutFile $archive -UseBasicParsing
            $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()
            if ($actual -ne $expectedSha256) { throw 'The downloaded Node.js archive failed its integrity check.' }
            if (Test-Path -LiteralPath $staging) { Remove-Item -Recurse -Force -LiteralPath $staging }
            Expand-Archive -LiteralPath $archive -DestinationPath $staging
            if (Test-Path -LiteralPath $nodeDir) { Remove-Item -Recurse -Force -LiteralPath $nodeDir }
            Move-Item -LiteralPath (Join-Path $staging $nodeFolder) -Destination $nodeDir
        } finally {
            if (Test-Path -LiteralPath $archive) { Remove-Item -Force -LiteralPath $archive }
            if (Test-Path -LiteralPath $staging) { Remove-Item -Recurse -Force -LiteralPath $staging }
        }
    }

    $env:PATH = "$nodeDir;$env:PATH"
    $lockFile = Join-Path $root 'package-lock.json'
    $stampFile = Join-Path $runtimeRoot 'windows-dependencies.sha256'
    $electronExe = Join-Path $root 'node_modules\electron\dist\electron.exe'
    $lockHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $lockFile).Hash
    $installedHash = if (Test-Path -LiteralPath $stampFile) { (Get-Content -Raw -LiteralPath $stampFile).Trim() } else { '' }

    Push-Location $root
    try {
        if ($lockHash -ne $installedHash -or -not (Test-Path -LiteralPath $electronExe)) {
            Write-Host 'First run or dependencies changed: setting up RightTab. This can take several minutes...'
            if (Test-Path -LiteralPath $stampFile) { Remove-Item -Force -LiteralPath $stampFile }
            & $npmCmd ci --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) { throw "Dependency setup failed (exit code $LASTEXITCODE)." }
            Set-Content -LiteralPath $stampFile -Value $lockHash -Encoding ASCII
        }
        if ($SetupOnly) { Write-Host 'RightTab setup is complete.'; return }
        Write-Host 'Starting RightTab...'
        & $npmCmd start
        if ($LASTEXITCODE -ne 0) { throw "RightTab exited with code $LASTEXITCODE." }
    } finally {
        Pop-Location
    }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
