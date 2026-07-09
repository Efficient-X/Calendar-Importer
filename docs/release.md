# Release Notes For Maintainers

For a GitHub release:

1. Confirm `manifest.json`, `versions.json`, `README.md`, `LICENSE`, `main.js`, and `styles.css` are correct.
2. Run `pnpm run test`.
3. Run `pnpm run build`.
4. Create a GitHub release whose tag matches the manifest version.
5. Attach `manifest.json`, `main.js`, and `styles.css` to the release.

Pushing a semver tag such as `1.0.0` triggers the release workflow.

## Community Plugin Submission

For Obsidian Community Plugins, submit the plugin after the public GitHub repository and release assets are available.

The plugin ID is `calendar-importer`. Do not change it after community release.
