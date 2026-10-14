# 0010: Self-update with tauri-plugin-updater and GitHub Releases

Date: 2026-10-14. Status: Accepted.

## Context

Installed copies of GCMD must update themselves without losing settings, the
recent list, or unsaved work. Settings already live in the OS app-config
dir (ADR 0006), outside the install dir. GCMD runs as many independent
processes as the user opens (invariant 6). The source moves to a public
GitHub repository. No OS code-signing certificate is planned.

## Options

| Option                                       | Verdict                                                                    |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| **`tauri-plugin-updater` + static manifest** | **Chosen**: built for Tauri bundles, signature check built in, any host    |
| Own download-and-run-installer code          | Rejected: reimplements signature checks and per-platform install           |
| OS stores / package managers only            | Rejected for now: no store accounts; `.deb` users still update through apt |

Hosting: **GitHub Releases** (public repository, free, `tauri-action` writes
the manifest). Any static HTTPS host would work with
`tools/release/manifest.mjs`.

## Decision

- **Manifest:** `https://github.com/DelTaGC/GCMD/releases/latest/download/latest.json`
  (`plugins.updater.endpoints` in `tauri.conf.json`). It lists version, notes,
  date and, per platform (`windows-x86_64`, `darwin-aarch64`, `darwin-x86_64`,
  `linux-x86_64`, `linux-x86_64-deb`), a download URL and a signature.
- **Signing:** an updater key pair (minisign, `tauri signer generate`),
  separate from OS code signing. The public key is in `tauri.conf.json`; the
  private key and its password exist only in the maintainer's password
  manager, an offline backup, and two GitHub Actions secrets. Losing it
  strands every installed copy (they must be reinstalled by hand).
  `requireSignedVersion` is on, so a manifest cannot pair a new version
  number with an old signed bundle (downgrade attack).
- **Builds:** `bundle.createUpdaterArtifacts` lives in
  `src-tauri/tauri.release.conf.json`, used by `npm run release:build` and the
  release workflow, so everyday `tauri build` does not need the private key.
- **Release flow:** `.github/workflows/release.yml` runs on a `vX.Y.Z` tag,
  checks that the tag equals the app version and that `CHANGELOG.md` has
  notes for it, runs `npm run check`, builds (Windows NSIS, macOS universal
  app, Linux deb + AppImage), signs, and uploads to a **draft** release.
  Publishing the draft is the moment installed copies see the update.
- **One version source:** `package.json`; `tauri.conf.json` points at it;
  `tools/release/version.mjs` sets and checks `package-lock.json`,
  `Cargo.toml` and `Cargo.lock` (`npm run check` fails on a mismatch).
- **Least privilege:** the plugin is driven from Rust (`updater.rs`) and
  exposed as five commands of our own (`update_check`, `update_install`,
  `update_other_instances`, `update_skip`, `set_auto_update`); the frontend
  gets no updater or process permission.
- **Policy (frontend, `app/updatePolicy.ts`):** a background check 5 s after
  startup, at most once a day across all windows (`updates.lastCheckMs` in
  settings), never in dev builds; Help > Check for Updates checks now;
  Help > Check Automatically turns the background check off. A skipped
  version stays quiet in background checks only. Errors of background checks
  (offline) are logged, never shown.
- **Install:** the banner offers Install and Restart / Release Notes / Skip
  This Version. Install first runs the session's unsaved-changes prompt.
  Settings fields were added without a schema bump (missing keys default).
- **Multiple instances on Windows:** the NSIS installer runs in passive mode
  with `/UPDATE`, and Tauri's installer then force-closes every process
  running the installed exe (Restart Manager, no prompt). Other GCMD windows
  could hold unsaved work, so `update_install` refuses while another process
  with the same executable file name runs (`sysinfo`, Windows-only
  dependency) and the banner asks the user to close them. The file name, not
  the path: the local test showed the same exe reported under two paths
  (`%LOCALAPPDATA%` redirection when started from an MSIX-packaged parent),
  which an exact path match missed, and the installer killed the other
  window. A false positive (a dev build running) only asks for one more
  window to be closed. macOS and the Linux AppImage/deb replace the files in
  place; running copies keep working until they restart.

## Consequences

- After an update, Windows relaunches GCMD with its original command line
  (the file it was started with), not the file open at the time.
- The first install still shows the SmartScreen / Gatekeeper warnings of an
  unsigned app; updates downloaded by the app do not.
- A release that should not reach users stays a draft; deleting a published
  release's `latest.json` stops further updates to it.
- `tauri-plugin-updater` adds an HTTP/TLS stack (reqwest, rustls, ring) to
  the binary.
