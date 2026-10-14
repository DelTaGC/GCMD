# 0011: GPL-3.0-or-later

Date: 2026-10-14. Status: Accepted.

## Context

The repository becomes public with signed releases (ADR 0010). The
maintainer wants a copyleft license: GPLv2, GPLv3 or AGPL, as far as the
dependencies allow. A dependency audit (npm runtime closure and the Rust
crates reachable on Windows, macOS and Linux) found:

- Permissive licenses for nearly everything: MIT, ISC, BSD-3-Clause, Zlib,
  Unicode-3.0, 0BSD, CC0, Unlicense, MPL-2.0 (none marked incompatible with
  secondary licenses), and dual `MIT OR Apache-2.0`.
- **Apache-2.0 only**: `tao` (Tauri's window layer), `sync_wrapper`, `dpi`,
  `ring` (Apache-2.0 AND ISC), and mermaid's parser `chevrotain` with its
  `@chevrotain/*` packages. Apache-2.0 is compatible with GPLv3, not GPLv2.
- **EPL-2.0 without the GPL secondary-license notice**: `elkjs`, which
  mermaid loads lazily for the optional ELK layouts (`layout: elk`,
  `flowchart-elk`). Not compatible with any GPL version.

## Options

| License          | Verdict                                                                       |
| ---------------- | ----------------------------------------------------------------------------- |
| GPL-2.0(-only/+) | Not possible: Apache-2.0-only `tao` is inseparable from Tauri                 |
| **GPL-3.0+**     | **Chosen**: compatible with every dependency once `elkjs` is out              |
| AGPL-3.0+        | Same compatibility; its network clause adds nothing for a desktop application |

## Decision

- GCMD is licensed **GPL-3.0-or-later**: `LICENSE` holds the GPLv3 text;
  `package.json`, `Cargo.toml` and `tauri.conf.json` (`bundle.license`, read
  by the Linux packages) say `GPL-3.0-or-later`.
- `elkjs` is replaced at build time by `src/editor/mermaid/elkUnavailable.ts`
  (Vite alias in `vite.config.ts`), so it is never shipped. A diagram that
  asks for an ELK layout shows the mermaid error in its widget; the default
  dagre layout is unaffected. Recorded in `docs/known-deviations.md`.
- `dompurify` (`MPL-2.0 OR Apache-2.0`) is used under Apache-2.0.

## Consequences

- A new dependency must be GPLv3-compatible; check its license (and its
  runtime dependencies') before adding it.
- The permissive licenses still require their copyright notices in binary
  distributions; a generated third-party notices file is still to be added
  to the bundles.
- The AppImage bundles LGPL system libraries (GTK, WebKitGTK); their source
  is available from the distribution they were taken from.
