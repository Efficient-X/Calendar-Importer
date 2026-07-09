# Release Notes For Maintainers

Release checklist:

1. Confirm `manifest.json`, `versions.json`, `README.md`, `LICENSE`, `main.js`, and `styles.css` are correct.
2. Run `pnpm run test`.
3. Run `pnpm run build`.
4. Push a semver tag such as `1.0.0`.
5. Confirm the GitHub release contains `manifest.json`, `main.js`, and `styles.css`.

The release workflow creates the GitHub release from the tag.

## Community Plugin Submission

Submit the plugin after the public GitHub repository and release assets are available.

The plugin ID is `calendar-importer`. Do not change it after community release.
