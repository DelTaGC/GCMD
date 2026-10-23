# 0014: Settings panel, keymap overrides and native spell-check

Date: 2026-10-23. Status: Accepted.

## Context

Phase 7 adds user settings beyond the menu toggles (fonts, sizes, colors,
shortcuts) and spell-checking. Choices weighed with the user: a panel in
the editor window or a separate settings window; a curated set of colors
or every CSS variable; full rebinding or a read-only shortcut list; the
webview's native spell-checker or a bundled Hunspell with our own
underline and suggestion UI.

## Decision

- **An overlay panel in the editor window** (`chrome/settings/panel.ts`,
  File > Settings or Ctrl+,; on macOS in the application menu). No second
  webview, capability file or cross-window events. Changes apply live and
  are saved at once; there is no OK/Cancel.
- **Appearance** is CSS custom properties written into one `<style>`
  element (`app/appearance.ts`): text and code font, code size (percent
  of the text), line height, and eight colors per theme
  (background, text, headings, links, markup, code background, quote bar,
  selection). Settings store only overrides; `src/styles.css` keeps the
  defaults. The panel's text size is the View > Zoom setting
  (`settings.fontSize`, `app/zoom.ts`), not a second size of its own. Font names are stripped of `; { } < > \` on both sides so a
  value cannot end the CSS rule.
- **Keymap overrides** are `{ commandId: keys[] }` in settings. A listed
  command gets exactly those keys (`[]` unbinds it); a default key taken
  by an override is dropped from its previous owner, and assigning a key
  in the panel removes it from the command that had it, with a notice.
  The editor keymap sits in a compartment and is reconfigured live
  (`setKeymapOverrides`). The Rust side applies the first key of each
  override to the native menu item of that id (`menu::apply_keymap`); a key
  the menu cannot express leaves the item without an accelerator. Recorded
  keys are refused when they contain a dead key of the Swiss-French
  layout, use Ctrl+Alt on Windows and Linux (AltGr), or are printable
  without Ctrl, Alt or Cmd. On Windows the menu consumes its accelerators
  before the webview, so while a key is being recorded a menu event is
  turned back into its key (`app/settings.ts` `interceptMenu`); while the
  panel is open, menu commands other than `file.*`, `view.*` and `help.*`
  are ignored.
- **Native spell-check.** The editor content gets `spellcheck="true"`
  through a compartment (`editor/spellcheck.ts`, on by default); inline
  code, code blocks, URLs, autolinks and HTML carry `spellcheck="false"`
  (`livePreview/spelling.ts`). Languages and suggestions are the operating
  system's. Tested on Windows (WebView2): misspellings are underlined as
  words are typed or a line is edited (text loaded from disk is not
  checked until then), right-click offers suggestions, and there is no
  "Add to dictionary" item nor an API for a custom word list, so GCMD
  keeps none. Hunspell stays the fallback if native
  checking proves insufficient (several MB of dictionaries and our own
  underline UI).
- **Settings changes merge with the file.** Every GCMD window is its own
  process with its own copy of the settings. `AppState::update` now
  applies each change to the file as it is on disk
  (`settings::merge_change`), so one window no longer overwrites what
  another saved since it started. Other open windows pick up appearance,
  shortcut and spell-check changes at their next start.

## Right-click menu (Windows)

The right-click menu in the editor is WebView2's own, not GCMD's. It is
kept as it is because it is the only place the spelling suggestions
appear: a web page cannot read them, so a menu of our own would lose them.
Checked on Windows 11 (2026-10-23):

| Item                      | Behavior in GCMD                                                                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spelling suggestions      | Shown at the top for an underlined word. No "Add to dictionary".                                                                                                           |
| Cut, Copy, Paste          | Standard clipboard items, plus "Paste as plain text".                                                                                                                      |
| Emoji                     | Opens the Windows emoji panel (Win+.). Smileys and the special characters tab work and insert plain text; the GIF tab does nothing.                                        |
| Writing direction         | Has no visible effect; it never changes the text.                                                                                                                          |
| More tools > Voice typing | Windows dictation (Win+H). Needs speech recognition enabled in Windows; not verified in GCMD yet.                                                                          |
| Inspect                   | Developer tools: present in `npm run app:dev` builds only. Tauri turns developer tools off in release builds, so installed copies have no Inspect item (checked in 0.2.0). |

Removing single items would need a `ContextMenuRequested` handler on the
WebView2 controller, which is COM code that needs `unsafe` Rust (forbidden
in this crate); turning the whole menu off (a wry setting, or blocking
`contextmenu` in the page) would also remove the spelling suggestions.
Revisit only if GCMD gets its own spell-checker (Hunspell) and therefore
its own suggestion UI. macOS and Linux show their own, different menus.

## Consequences

- No new dependency. Three Rust commands (`set_appearance`, `set_keymap`,
  `set_spellcheck`) without plugin permissions; new settings fields carry
  `#[serde(default)]`, so no schema bump.
- Spell-check quality and languages depend on the platform: Windows uses
  the Windows spell checker with the installed languages; macOS uses the
  system checker; WebKitGTK needs its languages set (not done yet, see the
  phase 7 checklist).
- The panel lists every registered command; rebinding Enter, Tab or the
  arrows is allowed and can be undone with the per-command reset or
  "Reset all shortcuts".
