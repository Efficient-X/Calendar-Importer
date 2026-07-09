# Privacy And Feed URL Safety

Private calendar feed links should be treated like passwords.

If someone has one of those links, they may be able to read that calendar. Calendar Importer keeps those links local in your vault settings.

```text
<your-vault>/.obsidian/plugins/calendar-importer/data.json
```

Plugin updates replace plugin files, not your local `data.json`, so your feed links and settings should stay put.

The local testing installer may also create backup files:

```text
<your-vault>/.obsidian/plugins/calendar-importer/data.settings-backup.json
<your-vault>/.obsidian/calendar-importer.settings-memory.json
```

Those files are private too. They are intentionally ignored by this repository.

If a private feed link is leaked, regenerate it in your calendar provider.
