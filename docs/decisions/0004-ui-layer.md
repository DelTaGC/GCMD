# 0004: Vanilla TypeScript + Vite for the chrome

Date: 2026-10-12. Status: Accepted.

## Context

Outside the editor, the UI is small: native menus (Tauri), a sidebar outline,
a selection quickbar, a few banners and dialogs, later a settings panel.
Startup time and bundle size are first-class requirements.

## Options

| Option             | Runtime cost        | Fit                                                                        |
| ------------------ | ------------------- | -------------------------------------------------------------------------- |
| Vanilla TypeScript | None                | Small UI surface, a few hundred lines of DOM code                          |
| Svelte 5           | Tiny                | Nice for a settings panel later; adds a compiler and a second mental model |
| SolidJS            | Small               | Same trade-off as Svelte                                                   |
| React              | Largest of the four | Overkill for the surface, hurts the lightweight goal                       |

## Decision

Vanilla TypeScript with Vite. Each chrome component is a module that builds
its DOM once and exposes an `update()` function. Menus are native via the
Tauri menu API, not HTML.

## Consequences

- No reactive framework means explicit update calls; keep components small
  and state local.
- If the settings UI (later phase) grows beyond what plain DOM keeps
  readable, Svelte can be adopted for that panel alone under a new ADR.
