# 0012: Additional permission for elkjs

Date: 2026-10-14. Status: Accepted. Amends ADR 0011.

## Context

ADR 0011 licensed GCMD GPL-3.0-or-later and left `elkjs` (EPL-2.0 without
the GPL secondary-license notice) out of the build through a stub, so
mermaid diagrams that ask for an ELK layout (`layout: elk`,
`flowchart-elk`) showed an error. For large or nested flowcharts ELK gives
much better layouts than dagre, and losing it made mermaid far less useful.

The conflict is one-sided. EPL-2.0 allows a "Larger Work" that combines the
EPL program with code under another license, as long as the EPL parts keep
their license and their source stays available. GPLv3 forbids conveying a
combination with code under incompatible terms, unless its licensors grant
an additional permission (section 7). All GPL code in GCMD is the
maintainer's own (no third-party GPL component; the AppImage's LGPL system
libraries are not linked into the covered work), so such a permission can
be given.

## Options

| Option                                              | Verdict                                                                    |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| **GPLv3 section 7 permission for elkjs**            | **Chosen**: ELK comes back unchanged; GCMD stays copyleft                  |
| Render ELK requests with dagre                      | Keeps diagrams visible but not their layout quality                        |
| Ask Eclipse ELK for a GPL secondary license         | Needs every contributor and the Eclipse Foundation; slow and uncertain     |
| Another layout engine as a mermaid layout loader    | No GPL-compatible engine matches ELK (d3-dag: no subgraphs; Graphviz: EPL) |
| Users install elkjs themselves (download or a file) | Network access, permissions and integrity pinning for one optional feature |
| A permissive license or MPL-2.0                     | Drops the copyleft goal of ADR 0011                                        |

## Decision

- `LICENSE-EXCEPTION` holds the additional permission, in the FSF's wording
  for GPL-incompatible libraries: combining GCMD with elkjs (or a modified
  version) is permitted, and the Corresponding Source of such a combination
  includes the source of the elkjs parts used. It is shipped next to
  `LICENSE` as `LICENSE-EXCEPTION.txt` (`bundle.resources`).
- License metadata (`package.json`, `Cargo.toml`, `tauri.conf.json`,
  `app_info`) is `GPL-3.0-or-later WITH AdditionRef-GCMD-elkjs-exception`
  (an SPDX 3 custom addition). Help > About names it.
- The Vite alias and the stub are removed: mermaid loads `elkjs` lazily in
  its own chunk, as it does for every other diagram engine.
- The license gate allows EPL-2.0 for the npm package `elkjs` only
  (`PACKAGE_EXCEPTIONS` in `tools/release/license-policy.mjs`). Its entry
  names where the source is, and `THIRD-PARTY-NOTICES.md` prints it in an
  "Under the additional permission" section, as EPL-2.0 requires when the
  program is distributed in object form. The release workflow no longer
  builds the frontend to scan it for elkjs code.

## Consequences

- Anyone redistributing GCMD may keep or drop the permission (section 7);
  dropping it means they must remove elkjs too.
- Contributions are accepted under the same terms, permission included.
- GPL-only code by someone else cannot be added unless its authors grant the
  same permission; this joins ADR 0011's rule that dependencies must be
  GPLv3-compatible.
- A further incompatible library would need its own permission and a new
  ADR, never a wider allow-list.
