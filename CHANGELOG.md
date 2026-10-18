# Changelog

One section per release, newest first. The section of a version becomes the
GitHub release text and the notes shown in the in-app update banner
(`tools/release/notes.mjs`), so write it for users.


## 0.2.0

QoL update. 

- Links: path auto-completion for local files links.
- Tables: highlight current cell and column header. 
- Tables: tools bar and handles to move/insert/delete columns and rows.  


## 0.1.0

First public release.

- Live-preview editing of one GitHub Flavored Markdown file per window, saved byte for byte (line endings, BOM and encoding kept).
- Tables, task lists, fenced code with syntax highlighting, Mermaid diagrams, images and links.
- Outline sidebar, selection toolbar, find and replace, external-change reload.
- Light and dark themes; Windows, macOS and Linux builds.
- Automatic updates: GCMD checks once a day and asks before installing (Help > Check for Updates).
