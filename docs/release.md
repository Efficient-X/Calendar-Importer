# Release Notes For Maintainers

Release checklist:

1. Confirm `manifest.json`, `versions.json`, `README.md`, `LICENSE`, `main.js`, and `styles.css` are correct.
2. Add a useful, non-empty section for the version in `CHANGELOG.md`.
3. Run `pnpm run check`.
4. Run `pnpm run build`.
5. Push a semver tag such as `1.0.0`.
6. Confirm the GitHub release contains `manifest.json`, `main.js`, and `styles.css`.
7. Confirm the release has a useful GitHub description.
8. Run the mobile/download verification script:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\verify-release.ps1" -Version "1.0.0"
```

The release workflow creates the GitHub release from the tag. It refuses to publish when the tag, manifest, package version, `versions.json`, or changelog description disagree.

## Mobile Release Checks

Calendar Importer is intended to work on desktop, iPhone, iPad, and Android.

Mobile installs and updates require all of these to be true:

- The GitHub release tag exactly matches `manifest.json` version.
- The release is published, not draft or prerelease.
- The release has downloadable `manifest.json`, `main.js`, and `styles.css` assets.
- The released `manifest.json` has `"isDesktopOnly": false`.
- The released `manifest.json` has plugin id `calendar-importer`.
- The released minimum Obsidian version does not unnecessarily exclude current desktop or mobile builds.
- The Obsidian community plugin index points to `Efficient-X/Calendar-Importer`.
- `main.js` does not use desktop-only APIs such as Electron, `fs`, `path`, or child processes.

If mobile shows an update but refuses to install it, check the release assets first. Obsidian can discover the version before the matching GitHub release assets are actually downloadable. Sneaky little trap.

## Community Plugin Submission

Submit the plugin after the public GitHub repository and release assets are available.

The plugin ID is `calendar-importer`. Do not change it after community release.
