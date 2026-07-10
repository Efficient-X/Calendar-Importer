param(
  [string]$Version = ""
)

$ErrorActionPreference = "Stop"

if (-not $Version) {
  $localManifest = Get-Content -Raw "manifest.json" | ConvertFrom-Json
  $Version = [string]$localManifest.version
}

$repo = "Efficient-X/Calendar-Importer"
$pluginId = "calendar-importer"
$requiredAssets = @("main.js", "manifest.json", "styles.css")
$headers = @{ "User-Agent" = "Calendar-Importer-Release-Check" }

function Invoke-WithRetry {
  param(
    [scriptblock]$Action,
    [string]$Description,
    [int]$Attempts = 6,
    [int]$DelaySeconds = 5
  )

  $lastError = $null
  for ($attempt = 1; $attempt -le $Attempts; $attempt += 1) {
    try {
      return & $Action
    } catch {
      $lastError = $_
      if ($attempt -ge $Attempts) {
        break
      }
      Write-Host "$Description not ready yet (attempt $attempt/$Attempts). Retrying in $DelaySeconds seconds..."
      Start-Sleep -Seconds $DelaySeconds
    }
  }

  throw $lastError
}

Write-Host "Checking Calendar Importer $Version..."

$release = Invoke-WithRetry -Description "Release $Version" -Action {
  Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/tags/$Version" -Headers $headers
}
if ($release.draft -or $release.prerelease) {
  throw "Release $Version must be a published stable release."
}
if ([string]::IsNullOrWhiteSpace([string]$release.body)) {
  throw "Release $Version must include a useful description."
}

$assetNames = @($release.assets | ForEach-Object { $_.name })
foreach ($asset in $requiredAssets) {
  if ($assetNames -notcontains $asset) {
    throw "Release $Version is missing $asset."
  }
}

$tempRoot = if ($env:TEMP) {
  $env:TEMP
} elseif ($env:TMPDIR) {
  $env:TMPDIR
} else {
  [System.IO.Path]::GetTempPath()
}
$tempDir = Join-Path $tempRoot "calendar-importer-release-$Version"
if (Test-Path $tempDir) {
  Remove-Item -LiteralPath $tempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $tempDir | Out-Null

try {
  foreach ($asset in $requiredAssets) {
    $url = "https://github.com/$repo/releases/download/$Version/$asset"
    $target = Join-Path $tempDir $asset
    Invoke-WithRetry -Description "$asset download" -Action {
      Invoke-WebRequest -Uri $url -OutFile $target -Headers $headers
    } | Out-Null
    if ((Get-Item $target).Length -le 0) {
      throw "$asset downloaded as an empty file."
    }
  }

  $manifest = Get-Content -Raw (Join-Path $tempDir "manifest.json") | ConvertFrom-Json
  if ($manifest.id -ne $pluginId) {
    throw "Release manifest id is '$($manifest.id)', expected '$pluginId'."
  }
  if ($manifest.version -ne $Version) {
    throw "Release manifest version is '$($manifest.version)', expected '$Version'."
  }
  if ($manifest.isDesktopOnly -ne $false) {
    throw "Release manifest must set isDesktopOnly to false for mobile installs."
  }

  $main = Get-Content -Raw (Join-Path $tempDir "main.js")
  $desktopOnlyPatterns = @(
    'require\("fs"\)',
    'require\("path"\)',
    'require\("os"\)',
    'require\("child_process"\)',
    'require\("electron"\)',
    "window\.electron",
    "process\."
  )
  foreach ($pattern in $desktopOnlyPatterns) {
    if ($main -match $pattern) {
      throw "main.js contains a desktop-only pattern: $pattern"
    }
  }

  $plugins = Invoke-WithRetry -Description "Obsidian community plugin index" -Action {
    Invoke-RestMethod -Uri "https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json" -Headers $headers
  }
  $entry = $plugins | Where-Object { $_.id -eq $pluginId } | Select-Object -First 1
  if (-not $entry) {
    throw "Plugin id '$pluginId' was not found in Obsidian community-plugins.json."
  }
  if ([string]$entry.repo -notmatch "Efficient-X/Calendar-Importer") {
    throw "Community plugin repo is '$($entry.repo)', expected Efficient-X/Calendar-Importer."
  }

  Write-Host "Release $Version is mobile-download ready."
  Write-Host "Assets: $($assetNames -join ', ')"
  Write-Host "Minimum Obsidian app version: $($manifest.minAppVersion)"
} finally {
  if (Test-Path $tempDir) {
    Remove-Item -LiteralPath $tempDir -Recurse -Force
  }
}
