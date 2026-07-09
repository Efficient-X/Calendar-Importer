param(
  [string]$VaultPath = $env:OBSIDIAN_VAULT_PATH
)

$ErrorActionPreference = "Stop"

$pluginId = "calendar-importer"
$legacyPluginIds = @("ical-events-to-tasks", "calendar-task-sync")
$sourcePath = Split-Path -Parent $MyInvocation.MyCommand.Path

if ([string]::IsNullOrWhiteSpace($VaultPath)) {
  $VaultPath = Read-Host "Enter the full path to your Obsidian vault"
}

$VaultPath = $VaultPath.Trim('"')
$obsidianPath = Join-Path $VaultPath ".obsidian"
$pluginPath = Join-Path $obsidianPath "plugins\$pluginId"
$communityPluginsPath = Join-Path $obsidianPath "community-plugins.json"
$pluginDataPath = Join-Path $pluginPath "data.json"
$pluginDataBackupPath = Join-Path $pluginPath "data.settings-backup.json"
$settingsMemoryPath = Join-Path $obsidianPath "calendar-importer.settings-memory.json"

function Write-Step($message) {
  Write-Host "[Calendar Importer] $message"
}

function Ensure-Setting($settings, $name, $value) {
  if ($null -eq $settings.PSObject.Properties[$name]) {
    $settings | Add-Member -NotePropertyName $name -NotePropertyValue $value -Force
  }
}

function ConvertTo-StringArray($value) {
  if ($null -eq $value) {
    return @()
  }

  if ($value.PSObject.Properties["value"]) {
    return ConvertTo-StringArray $value.value
  }

  $items = @()
  foreach ($item in @($value)) {
    if ($item -is [string]) {
      $items += $item
    } elseif ($item.PSObject.Properties["value"]) {
      $items += ConvertTo-StringArray $item.value
    }
  }

  return $items
}

function Write-StringArrayJson($path, [string[]]$items) {
  $jsonItems = @($items | ForEach-Object { "  " + ($_ | ConvertTo-Json) })
  $json = "[`n" + ($jsonItems -join ",`n") + "`n]"
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $json, $utf8NoBom)
}

if (-not (Test-Path -LiteralPath $VaultPath)) {
  throw "Vault path does not exist: $VaultPath"
}

if (-not (Test-Path -LiteralPath $obsidianPath)) {
  throw "Obsidian config folder does not exist: $obsidianPath"
}

foreach ($requiredFile in @("manifest.json", "main.js", "README.md", "styles.css")) {
  $fullPath = Join-Path $sourcePath $requiredFile
  if (-not (Test-Path -LiteralPath $fullPath)) {
    throw "Missing required plugin file: $fullPath"
  }
}

Write-Step "Installing into $pluginPath"
New-Item -ItemType Directory -Force -Path $pluginPath | Out-Null

if (Test-Path -LiteralPath $pluginDataPath) {
  Copy-Item -LiteralPath $pluginDataPath -Destination $pluginDataBackupPath -Force
  Copy-Item -LiteralPath $pluginDataPath -Destination $settingsMemoryPath -Force
  Write-Step "Backed up existing plugin settings before updating"
} elseif (Test-Path -LiteralPath $settingsMemoryPath) {
  Copy-Item -LiteralPath $settingsMemoryPath -Destination $pluginDataPath -Force
  Write-Step "Restored plugin settings from local settings memory"
} else {
  foreach ($legacyPluginId in $legacyPluginIds) {
    $legacyPluginDataPath = Join-Path $obsidianPath "plugins\$legacyPluginId\data.json"
    $legacySettingsMemoryPath = Join-Path $obsidianPath "$legacyPluginId.settings-memory.json"

    if (Test-Path -LiteralPath $legacyPluginDataPath) {
      Copy-Item -LiteralPath $legacyPluginDataPath -Destination $pluginDataPath -Force
      Write-Step "Migrated settings from previous local test plugin ID"
      break
    }

    if (Test-Path -LiteralPath $legacySettingsMemoryPath) {
      Copy-Item -LiteralPath $legacySettingsMemoryPath -Destination $pluginDataPath -Force
      Write-Step "Restored settings from previous local test settings memory"
      break
    }
  }
}

Copy-Item -LiteralPath (Join-Path $sourcePath "manifest.json") -Destination (Join-Path $pluginPath "manifest.json") -Force
Copy-Item -LiteralPath (Join-Path $sourcePath "main.js") -Destination (Join-Path $pluginPath "main.js") -Force
Copy-Item -LiteralPath (Join-Path $sourcePath "README.md") -Destination (Join-Path $pluginPath "README.md") -Force
Copy-Item -LiteralPath (Join-Path $sourcePath "styles.css") -Destination (Join-Path $pluginPath "styles.css") -Force

if (Test-Path -LiteralPath $communityPluginsPath) {
  $raw = Get-Content -Raw -LiteralPath $communityPluginsPath
  if ([string]::IsNullOrWhiteSpace($raw)) {
    $plugins = @()
  } else {
    $plugins = ConvertTo-StringArray ($raw | ConvertFrom-Json)
  }
} else {
  $plugins = @()
}

$plugins = @($plugins | Where-Object { $legacyPluginIds -notcontains $_ } | Select-Object -Unique)

if ($plugins -notcontains $pluginId) {
  $plugins += $pluginId
  Write-Step "Enabled plugin in community-plugins.json"
} else {
  Write-Step "Plugin was already enabled in community-plugins.json"
}
Write-StringArrayJson $communityPluginsPath $plugins

if (Test-Path -LiteralPath $pluginDataPath) {
  $settingsRaw = Get-Content -Raw -LiteralPath $pluginDataPath
  if (-not [string]::IsNullOrWhiteSpace($settingsRaw)) {
    $settings = $settingsRaw | ConvertFrom-Json
    Ensure-Setting $settings "preserveManualCompletion" $true
    Ensure-Setting $settings "showManagedBlockMarkers" $false
    Ensure-Setting $settings "detailPlacement" "before-date"
    Ensure-Setting $settings "completedTaskMode" "move-to-completed-section"
    Ensure-Setting $settings "completedHeading" "## Completed Calendar Tasks"
    Ensure-Setting $settings "completedRetentionDays" 0
    Ensure-Setting $settings "includeColorSwatch" $true
    Ensure-Setting $settings "multiDayAllDayEventMode" "daily"
    Ensure-Setting $settings "includeEventCreator" $false
    Ensure-Setting $settings "includeEventCreated" $false
    Ensure-Setting $settings "includeEventLastModified" $false
    Ensure-Setting $settings "includeReminderTasks" $false
    Ensure-Setting $settings "minimumReminderLeadDays" 1
    if ($settings.heading -eq "## Google Calendar") { $settings.heading = "## My Calendar Events" }
    if ($settings.taskTemplate -is [string]) {
      $calendarMarker = [char]::ConvertFromUtf32(0x1F4C5)
      $scheduledMarker = [char]::ConvertFromUtf32(0x23F3)
      $legacyTemplate = "{{title}}{{detailsSeparator}}{{details}} - {{weekday}} - {{time}} $calendarMarker {{date}}"
      $newTemplate = "{{title}} - {{weekday}} - {{time}}{{preDateDetails}} {{dateMarker}} {{date}}{{postDateDetails}}"
      if ($settings.taskTemplate -eq $legacyTemplate -or ($settings.taskTemplate.IndexOf($calendarMarker) -lt 0 -and $settings.taskTemplate.IndexOf($scheduledMarker) -lt 0)) {
        $settings.taskTemplate = $newTemplate
      }
    }
    foreach ($feed in @($settings.feeds)) {
      if ($null -eq $feed.tags) { $feed | Add-Member -NotePropertyName "tags" -NotePropertyValue "" -Force }
      if ($null -eq $feed.includeKeywords) { $feed | Add-Member -NotePropertyName "includeKeywords" -NotePropertyValue "" -Force }
      if ($null -eq $feed.excludeKeywords) { $feed | Add-Member -NotePropertyName "excludeKeywords" -NotePropertyValue "" -Force }
    }
    $settings | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $pluginDataPath -Encoding UTF8
    Copy-Item -LiteralPath $pluginDataPath -Destination $pluginDataBackupPath -Force
    Copy-Item -LiteralPath $pluginDataPath -Destination $settingsMemoryPath -Force
    Write-Step "Migrated existing plugin settings for release defaults and cleaner notes"
    Write-Step "Saved updated settings memory for future installs"
  }
}

Write-Step "Done. Restart Obsidian or reload plugins if Obsidian is already open."
Write-Step "Installed files:"
Get-ChildItem -LiteralPath $pluginPath | Select-Object Name, Length | Format-Table -AutoSize
