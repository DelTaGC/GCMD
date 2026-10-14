# Phase 6: self-update

Run against a real published release (or the local setup in
`docs/release.md`), with an older version installed. Windows first; macOS
and Linux on the CI builds.

## Checking

- [ ] A few seconds after startup a banner says "GCMD X.Y.Z is available (you have ...)"; opening the app again the same day shows no second check.
- [ ] Help > Check for Updates (macOS: GCMD menu) shows the banner at once; when up to date it says "GCMD X is the latest version".
- [ ] Offline: the background check stays silent; the manual check shows an error dialog.
- [ ] Help > Check Automatically unchecked: no banner after a restart (the setting survives the restart); the manual check still works.
- [ ] Release Notes shows the CHANGELOG section, then the banner comes back.
- [ ] Skip This Version: no banner after restarting on the next day (or after clearing `updates.lastCheckMs` in settings.json); the manual check still offers it.

## Installing

- [ ] Clean document: Install and Restart shows the download percentage, the installer progress (Windows), and GCMD restarts at the new version (Help > About).
- [ ] Dirty document: Install first asks Save / Don't Save / Cancel; Cancel brings the banner back and nothing is installed.
- [ ] Windows, a second GCMD window open: Install says another window is open and installs nothing; after closing it, Try Again installs.
- [ ] After the update: theme, sidebar state, recent files and window size are unchanged; `.md` files still open in GCMD by double-click.
- [ ] A manifest pointing at a bundle with a wrong signature (edit `latest.json`) is refused with an error; the installed version still runs.
- [ ] Both themes: the banner and its buttons are readable.
