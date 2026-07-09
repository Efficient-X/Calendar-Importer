# Privacy And Feed URL Safety

Private iCal/ICS feed URLs should be treated like passwords. Anyone with the URL may be able to read that calendar feed.

Calendar Importer stores feed URLs only in the local Obsidian plugin settings file for the vault where it is installed:

```text
<your-vault>/.obsidian/plugins/calendar-importer/data.json
```

Plugin updates replace the plugin files, not the user's local `data.json`. Existing feed URLs and settings are preserved across normal Obsidian updates.

The local installer may also create private backup files:

```text
<your-vault>/.obsidian/plugins/calendar-importer/data.settings-backup.json
<your-vault>/.obsidian/calendar-importer.settings-memory.json
```

Treat those files as private. They are intentionally ignored by this repository.

If a private feed URL is leaked, regenerate it in your calendar provider.
