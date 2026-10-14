# Releasing GCMD

How a version reaches installed copies (ADR 0010). Releases are built by
GitHub Actions (`.github/workflows/release.yml`); nothing is uploaded from
this machine.

## One-time setup

1. **Updater key pair.** Generate it once, with a password, outside the repo:

   ```bash
   npx tauri signer generate -w ~/.tauri/gcmd-updater.key
   ```

   - Put `~/.tauri/gcmd-updater.key` and the password in the password
     manager, and keep an offline backup. **If the key is lost, installed
     copies can never update again** and must be reinstalled by hand.
   - Copy the content of `~/.tauri/gcmd-updater.key.pub` into
     `src-tauri/tauri.conf.json` > `plugins.updater.pubkey` and commit it.

2. **Repository.** Public GitHub repository; the owner/name must match
   `plugins.updater.endpoints` in `src-tauri/tauri.conf.json`
   (`https://github.com/<owner>/<repo>/releases/latest/download/latest.json`).
3. **Secrets** (Settings > Secrets and variables > Actions):
   `TAURI_SIGNING_PRIVATE_KEY` = the content of the private key file,
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = its password.
4. Settings > Actions > General > Workflow permissions: "Read and write"
   (the workflow creates releases with `GITHUB_TOKEN`).

## Each release

1. Add a `## X.Y.Z` section at the top of `CHANGELOG.md`, written for users:
   it becomes the GitHub release text and the notes in the update banner.
2. `npm run release:version -- X.Y.Z` (sets package.json, package-lock.json,
   Cargo.toml, Cargo.lock), then `npm run check`.
3. Commit (`chore(release): vX.Y.Z`), tag and push:

   ```bash
   git tag vX.Y.Z
   ```

   ```bash
   git push origin main vX.Y.Z
   ```

4. The `release` workflow builds, signs and uploads to a **draft** release:
   Windows NSIS installer, macOS universal `.app`/`.dmg`, Linux `.deb` and
   AppImage, their `.sig` files and `latest.json`.
5. Check the draft: every platform present in `latest.json`; install the
   Windows build on top of the previous version if anything risky changed.
6. **Publish** the draft. From that moment installed copies find the update
   (within a day, or at once with Help > Check for Updates).

A broken release: publish a fixed `X.Y.Z+1` quickly; never re-use a version
number (`requireSignedVersion` ties each signature to its version).

## Testing updates locally

Without GitHub, against a throwaway key and a local server (what was done
for phase 6):

1. `npx tauri signer generate --ci -p test -w <tmp>/test.key`
2. A config overlay `<tmp>/overlay.json` with a different `productName` and
   `identifier` (so it installs beside a real GCMD), `version`,
   `bundle.fileAssociations: []`, `bundle.createUpdaterArtifacts: true`,
   and `plugins.updater` with the test public key, the endpoint
   `http://localhost:8765/latest.json` and
   `dangerousInsecureTransportProtocol: true` (never in the real config).
3. Build the old and the new version with
   `TAURI_SIGNING_PRIVATE_KEY=<tmp>/test.key TAURI_SIGNING_PRIVATE_KEY_PASSWORD=test npx tauri build --bundles nsis --config <tmp>/overlay.json`,
   changing `version` in the overlay between the two.
4. `npm run release:manifest -- --base-url http://localhost:8765 --out-dir <tmp>/site`
   after building the new version, then serve `<tmp>/site` on port 8765
   (`npx http-server <tmp>/site -p 8765`).
5. Install the old version, run Help > Check for Updates, install.
6. Uninstall the test app afterwards (Settings > Apps) and delete its
   app-config folder.
