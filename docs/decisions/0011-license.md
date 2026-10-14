# 0011: GPL-3.0-or-later

Date: 2026-10-14. Status: Accepted; amended by ADR 0012 (additional
permission for elkjs, which is shipped again).

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
- `elkjs` is replaced at build time by a stub, so it is never shipped. A
  diagram that asks for an ELK layout shows an error in its widget; the
  default dagre layout is unaffected. (Superseded by ADR 0012: GCMD's
  license grants an additional permission for elkjs, which ships again.)
- `dompurify` (`MPL-2.0 OR Apache-2.0`) is used under Apache-2.0.

## Consequences

- A new dependency must be GPLv3-compatible; check its license (and its
  runtime dependencies') before adding it.
- The permissive licenses require their copyright notices in binary
  distributions. `tools/release/licenses.mjs` (`npm run licenses`)
  generates `THIRD-PARTY-NOTICES.md` at the repository root from the npm
  runtime closure and the Rust crates reachable on Windows, macOS and Linux:
  every package with its license and its license, notice and copyright
  files, identical texts printed once. For an OR it reproduces only the
  option GCMD uses (MIT first; `dompurify` under Apache-2.0). Packages with
  no license file get a standard text (`tools/release/license-texts/`) with
  their authors. The file is committed (`tauri-build` needs it for every
  cargo build) and shipped with `LICENSE` as bundle resources
  (`LICENSE.txt`, `THIRD-PARTY-NOTICES.md` next to the executable);
  Help > About names its path.
- The same tool is the license gate: it fails on a package without a license
  or outside the allow-list in `tools/release/license-policy.mjs` (MIT, ISC,
  BSD-2/3-Clause, Zlib, 0BSD, CC0-1.0, Unlicense, Unicode-3.0, Apache-2.0
  with or without LLVM-exception, MPL-2.0; an OR needs one allowed option).
  `npm run check` fails when the committed file is out of date, and the
  release workflow regenerates it. (ADR 0012 adds a per-package exception
  for elkjs and drops the scan of `dist/` for elkjs code.)
  A package whose metadata has no license field gets a reviewed entry in
  `LICENSE_OVERRIDES` (per version).
- The AppImage bundles LGPL system libraries (GTK, WebKitGTK); their source
  is available from the distribution they were taken from.
