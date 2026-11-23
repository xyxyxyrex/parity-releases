$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$root = Join-Path $env:RUNNER_TEMP 'Parity Test Install'
$profile = Join-Path $env:APPDATA 'Parity'
$marker = Join-Path $profile 'installer-lifecycle-marker.txt'
$exe = Join-Path $root 'Parity.exe'
$receipt = Join-Path $env:RUNNER_TEMP 'parity-lifecycle.json'
$markerText = 'The installer must preserve this existing profile file.'
$results = [ordered]@{
  image = $env:ImageVersion
  windows = [Environment]::OSVersion.VersionString
  candidateSha256 = $env:PARITY_CANDIDATE_SHA256
  nativeNoticesSha256 = $env:PARITY_NATIVE_NOTICES_SHA256
  checks = [Collections.Generic.List[string]]::new()
}

function Invoke-InstallerProcess($file, $arguments) {
  $process = Start-Process -FilePath $file -ArgumentList $arguments -WindowStyle Hidden -PassThru -Wait
  if ($process.ExitCode -ne 0) { throw "$(Split-Path $file -Leaf) returned $($process.ExitCode)" }
}

function Confirm-Profile {
  if ((Get-Content -LiteralPath $marker -Raw) -cne $markerText) { throw 'Profile marker changed' }
}

function Install-Version($version) {
  $installer = Join-Path $env:RUNNER_TEMP "Parity-Setup-$version.exe"
  # NSIS requires /D= as its last argument, with no quotes around the path.
  Invoke-InstallerProcess $installer "/S /D=$root"
  $productVersion = (Get-Item -LiteralPath $exe).VersionInfo.ProductVersion
  if ($productVersion -notmatch "^$([regex]::Escape($version))(?:\.0)?$") { throw "Installed $productVersion, expected $version" }
  $uninstaller = Join-Path $root 'Uninstall Parity.exe'
  if (!(Test-Path -LiteralPath $uninstaller)) { throw 'Uninstaller missing' }
}

function Confirm-Collector {
  $collector = Join-Path $root 'resources/search-insights-collector'
  $runtime = Join-Path $collector 'runtime/win32-x64'
  $manifest = Get-Content -LiteralPath (Join-Path $runtime 'runtime-manifest.json') -Raw | ConvertFrom-Json -AsHashtable
  if (Test-Path -LiteralPath (Join-Path $runtime $manifest.chromium)) { throw 'Dedicated browser was unexpectedly installed' }
  $source = Get-Content -LiteralPath (Join-Path $collector 'source-inventory.json') -Raw | ConvertFrom-Json
  foreach ($archive in $source.sources) {
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $collector $archive.path)).Hash
    if ($hash -ne $archive.sha256) { throw "Installed source archive failed validation: $($archive.filename)" }
  }
  $notices = Join-Path $collector 'THIRD-PARTY-NOTICES.txt'
  if ((Get-FileHash -LiteralPath $notices -Algorithm SHA256).Hash -ne $env:PARITY_NATIVE_NOTICES_SHA256) {
    throw 'Installed third-party notices differ from the reviewed file'
  }
  $noticeInventory = Get-Content -LiteralPath (Join-Path $collector 'notice-inventory.json') -Raw | ConvertFrom-Json
  $noticeCount = ($noticeInventory.nativeComponentNotices.components.notices | Measure-Object).Count
  if ($noticeCount -ne 12) { throw "Expected twelve additional native notices, found $noticeCount" }
  & (Join-Path $runtime 'python.exe') -I -B -c "import importlib.metadata as m; from scrapling.fetchers import FetcherSession, StealthySession; assert m.version('scrapling') == '0.5.1'"
  if ($LASTEXITCODE -ne 0) { throw 'Installed Scrapling import failed' }
}

function Uninstall-Parity {
  $uninstaller = Join-Path $root 'Uninstall Parity.exe'
  Invoke-InstallerProcess $uninstaller '/S'
  if (Test-Path -LiteralPath $exe) { throw 'Uninstall left the Parity executable in place' }
  Confirm-Profile
}

try {
  if ((Test-Path -LiteralPath $root) -or (Test-Path -LiteralPath $profile)) { throw 'Runner already has a Parity install or profile' }
  Install-Version '1.6.5'
  Confirm-Collector
  $results.checks.Add('Clean silent NSIS install, installed notices/source hashes, and Scrapling import passed.')
  New-Item -ItemType Directory -Path $profile -Force | Out-Null
  [IO.File]::WriteAllText($marker, $markerText)

  # Force the reinstall to prove the collector file was restored.
  $notice = Join-Path $root 'resources/search-insights-collector/THIRD-PARTY-NOTICES.txt'
  Remove-Item -LiteralPath $notice
  Install-Version '1.6.5'
  Confirm-Collector
  Confirm-Profile
  $results.checks.Add('Same-version reinstall restored a missing collector notice and preserved the profile marker.')

  Uninstall-Parity
  $results.checks.Add('Silent uninstall removed Parity.exe and preserved the profile marker.')
  Install-Version '1.6.4'
  Confirm-Profile
  Install-Version '1.6.5'
  Confirm-Collector
  Confirm-Profile
  $results.checks.Add('In-place 1.6.4 to 1.6.5 update through NSIS preserved the profile marker.')

  Install-Version '1.6.4'
  Confirm-Profile
  $results.checks.Add('Explicit rollback by reinstalling the public 1.6.4 installer preserved the profile marker.')
  Uninstall-Parity
  $results.result = 'passed'
} catch {
  $results.result = 'failed'
  $results.error = $_.Exception.Message
  throw
} finally {
  $results | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $receipt -Encoding utf8
  $results | ConvertTo-Json -Depth 5
}
