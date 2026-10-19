//! Native application menu.
//!
//! Every item id is a frontend command id (see `src/editor/commands/`), so
//! the menu event handler in `lib.rs` just forwards the id over the `menu`
//! event and the frontend runs the command. Recent files use the id
//! `recent:<path>`. The menu is rebuilt whenever the settings change so the
//! recent list and the theme check marks stay current.

use tauri::menu::{
    CheckMenuItem, ContextMenu, Menu, MenuItem, MenuItemKind, PredefinedMenuItem, Submenu,
};
use tauri::{AppHandle, LogicalPosition, Runtime, Window};

use crate::settings::{Settings, Theme, UpdateCheck, WrapMode};

/// Prefix of recent-file item ids; the rest is the path.
pub const RECENT_PREFIX: &str = "recent:";
/// Id of the "Clear Recent" item, handled in Rust rather than forwarded.
pub const CLEAR_RECENT_ID: &str = "file.clearRecent";

/// Top-level submenus with the approximate x offset (logical pixels) of
/// their title in the menu bar, used to pop them up from the keyboard.
/// `WebView2` swallows Alt+letter, so the frontend asks us to open the menu.
const TOP_LEVEL: [(&str, f64); 4] = [
    ("menu.file", 0.0),
    ("menu.edit", 34.0),
    ("menu.view", 70.0),
    ("menu.help", 112.0),
];

fn item<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    text: &str,
    accelerator: Option<&str>,
) -> tauri::Result<MenuItem<R>> {
    MenuItem::with_id(app, id, text, true, accelerator)
}

fn recent_submenu<R: Runtime>(
    app: &AppHandle<R>,
    settings: &Settings,
) -> tauri::Result<Submenu<R>> {
    let submenu = Submenu::with_id(app, "file.openRecent", "Open &Recent", true)?;
    for path in &settings.recent_files {
        let id = format!("{RECENT_PREFIX}{path}");
        // Ampersands would become mnemonics on Windows.
        let text = path.replace('&', "&&");
        submenu.append(&MenuItem::with_id(app, id, text, true, None::<&str>)?)?;
    }
    if !settings.recent_files.is_empty() {
        submenu.append(&PredefinedMenuItem::separator(app)?)?;
    }
    let clear = MenuItem::with_id(
        app,
        CLEAR_RECENT_ID,
        "&Clear Recent",
        !settings.recent_files.is_empty(),
        None::<&str>,
    )?;
    submenu.append(&clear)?;
    Ok(submenu)
}

/// Accelerator of the Exit / Quit item. Windows has no convention for it
/// (Alt+F4 closes the window anyway); Linux and macOS expect Ctrl+Q / Cmd+Q.
/// It is kept in a constant so the keymap-sync test (`keymap.test.ts`) does
/// not see it as a shortcut the editor must bind.
const EXIT_ACCELERATOR: Option<&str> = if cfg!(target_os = "windows") {
    None
} else {
    Some("CmdOrCtrl+Q")
};

/// The application menu macOS shows under the app name as the first menu.
/// Quit goes through our `file.exit` command (not the predefined item) so the
/// unsaved-changes prompt still runs.
#[cfg(target_os = "macos")]
fn app_menu<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> tauri::Result<Submenu<R>> {
    Submenu::with_id_and_items(
        app,
        "menu.app",
        "GCMD",
        true,
        &[
            &item(app, "help.about", "About GCMD", None)?,
            &item(app, "help.checkUpdates", "Check for Updates...", None)?,
            &auto_update_item(app, settings)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &item(app, "file.exit", "Quit GCMD", EXIT_ACCELERATOR)?,
        ],
    )
}

fn file_menu<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> tauri::Result<Submenu<R>> {
    let submenu = Submenu::with_id_and_items(
        app,
        "menu.file",
        "&File",
        true,
        &[
            &item(app, "file.new", "&New", Some("CmdOrCtrl+N"))?,
            &item(
                app,
                "file.newWindow",
                "New &Window",
                Some("CmdOrCtrl+Shift+N"),
            )?,
            &item(app, "file.open", "&Open...", Some("CmdOrCtrl+O"))?,
            &recent_submenu(app, settings)?,
            &PredefinedMenuItem::separator(app)?,
            &item(app, "file.save", "&Save", Some("CmdOrCtrl+S"))?,
            &item(app, "file.saveAs", "Save &As...", Some("CmdOrCtrl+Shift+S"))?,
        ],
    )?;
    // On macOS, Quit lives in the application menu.
    if !cfg!(target_os = "macos") {
        submenu.append_items(&[
            &PredefinedMenuItem::separator(app)?,
            &item(app, "file.exit", "E&xit", EXIT_ACCELERATOR)?,
        ])?;
    }
    Ok(submenu)
}

fn format_submenu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    Submenu::with_items(
        app,
        "F&ormat",
        true,
        &[
            &item(app, "format.strong", "&Bold", Some("CmdOrCtrl+B"))?,
            &item(app, "format.emphasis", "&Italic", Some("CmdOrCtrl+I"))?,
            &item(
                app,
                "format.inlineCode",
                "Inline &Code",
                Some("CmdOrCtrl+E"),
            )?,
            &item(
                app,
                "format.strikethrough",
                "&Strikethrough",
                Some("CmdOrCtrl+Shift+X"),
            )?,
            &item(app, "format.link", "&Link", Some("CmdOrCtrl+K"))?,
            &PredefinedMenuItem::separator(app)?,
            &item(app, "format.clearFormatting", "Clear &Formatting", None)?,
        ],
    )
}

fn heading_submenu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    Submenu::with_items(
        app,
        "&Heading",
        true,
        &[
            &item(app, "format.paragraph", "&Paragraph", Some("CmdOrCtrl+0"))?,
            &item(app, "format.heading1", "Heading &1", Some("CmdOrCtrl+1"))?,
            &item(app, "format.heading2", "Heading &2", Some("CmdOrCtrl+2"))?,
            &item(app, "format.heading3", "Heading &3", Some("CmdOrCtrl+3"))?,
            &item(app, "format.heading4", "Heading &4", Some("CmdOrCtrl+4"))?,
            &item(app, "format.heading5", "Heading &5", Some("CmdOrCtrl+5"))?,
            &item(app, "format.heading6", "Heading &6", Some("CmdOrCtrl+6"))?,
        ],
    )
}

fn line_submenu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    Submenu::with_items(
        app,
        "&Line",
        true,
        &[
            &item(app, "line.duplicate", "&Duplicate", Some("CmdOrCtrl+D"))?,
            &item(app, "line.moveUp", "Move &Up", Some("Alt+Up"))?,
            &item(app, "line.moveDown", "Move Dow&n", Some("Alt+Down"))?,
            &item(app, "line.copyUp", "Copy U&p", Some("Shift+Alt+Up"))?,
            &item(app, "line.copyDown", "Copy D&own", Some("Shift+Alt+Down"))?,
            &item(app, "line.delete", "De&lete", Some("CmdOrCtrl+Shift+K"))?,
        ],
    )
}

fn table_submenu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    Submenu::with_items(
        app,
        "&Table",
        true,
        &[
            &item(
                app,
                "table.insertRowAbove",
                "Insert Row &Above",
                Some("CmdOrCtrl+Shift+Enter"),
            )?,
            &item(
                app,
                "table.insertRowBelow",
                "Insert Row &Below",
                Some("CmdOrCtrl+Enter"),
            )?,
            &item(app, "table.deleteRow", "Delete &Row", None)?,
            &PredefinedMenuItem::separator(app)?,
            &item(app, "table.insertColumnLeft", "Insert Column &Left", None)?,
            &item(app, "table.insertColumnRight", "Insert Column Ri&ght", None)?,
            &item(app, "table.deleteColumn", "Delete &Column", None)?,
            &item(
                app,
                "table.moveColumnLeft",
                "Move Column Le&ft",
                Some("Shift+Alt+Left"),
            )?,
            &item(
                app,
                "table.moveColumnRight",
                "Move Column Rig&ht",
                Some("Shift+Alt+Right"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &item(app, "table.alignColumnNone", "Column: &Default", None)?,
            &item(app, "table.alignColumnLeft", "Column: Align L&eft", None)?,
            &item(
                app,
                "table.alignColumnCenter",
                "Column: Align Ce&nter",
                None,
            )?,
            &item(app, "table.alignColumnRight", "Column: Align Righ&t", None)?,
            &PredefinedMenuItem::separator(app)?,
            &item(app, "table.align", "Align &Table", Some("Shift+Alt+F"))?,
        ],
    )
}

/// Undo/Redo (and on macOS Cut/Copy/Paste/Select All) at the top of Edit.
///
/// On Windows and Linux our items carry no accelerator on purpose: the key
/// must reach the webview so that an input field (search panel) can handle
/// its own undo. On macOS the opposite holds: `WKWebView` only acts on
/// Cmd+Z/X/C/V/A when the menu carries the standard items, which route the
/// selector to the focused element (editor or search input) themselves.
fn edit_history_items<R: Runtime>(app: &AppHandle<R>, submenu: &Submenu<R>) -> tauri::Result<()> {
    if cfg!(target_os = "macos") {
        submenu.append_items(&[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ])
    } else {
        submenu.append_items(&[
            &item(app, "edit.undo", "&Undo", None)?,
            &item(app, "edit.redo", "&Redo", None)?,
        ])
    }
}

fn edit_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    // Every accelerator here mirrors `src/editor/keymap.ts`; a unit test on
    // the frontend side keeps the two in sync.
    let submenu = Submenu::with_id(app, "menu.edit", "&Edit", true)?;
    edit_history_items(app, &submenu)?;
    submenu.append_items(&[
        &PredefinedMenuItem::separator(app)?,
        &item(app, "search.find", "&Find...", Some("CmdOrCtrl+F"))?,
        &item(
            app,
            "search.replace",
            "Find and Re&place...",
            Some("CmdOrCtrl+H"),
        )?,
        &item(app, "search.next", "Find &Next", Some("F3"))?,
        &item(app, "search.previous", "Find Pre&vious", Some("Shift+F3"))?,
        &PredefinedMenuItem::separator(app)?,
        &format_submenu(app)?,
        &heading_submenu(app)?,
        &line_submenu(app)?,
        &table_submenu(app)?,
        &PredefinedMenuItem::separator(app)?,
        &item(app, "list.toggleTask", "Toggle &Task", Some("CmdOrCtrl+L"))?,
        &item(
            app,
            "code.detectLanguage",
            "Detect &Code Language",
            Some("Shift+Alt+L"),
        )?,
    ])?;
    Ok(submenu)
}

fn theme_submenu<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> tauri::Result<Submenu<R>> {
    let check = |id: &str, text: &str, theme: Theme| {
        CheckMenuItem::with_id(app, id, text, true, settings.theme == theme, None::<&str>)
    };
    Submenu::with_items(
        app,
        "&Theme",
        true,
        &[
            &check("view.theme.light", "&Light", Theme::Light)?,
            &check("view.theme.dark", "&Dark", Theme::Dark)?,
            &check("view.theme.system", "&System", Theme::System)?,
        ],
    )
}

fn wrap_submenu<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> tauri::Result<Submenu<R>> {
    let check = |id: &str, text: &str, mode: WrapMode| {
        CheckMenuItem::with_id(
            app,
            id,
            text,
            true,
            settings.wrap.mode == mode,
            None::<&str>,
        )
    };
    Submenu::with_items(
        app,
        "Line &Wrap",
        true,
        &[
            &check("view.wrap.off", "&Off", WrapMode::Off)?,
            &check("view.wrap.full", "&Full Width", WrapMode::Full)?,
            &check("view.wrap.fixed", "Fi&xed Width", WrapMode::Fixed)?,
        ],
    )
}

/// Zoom items carry no accelerator: muda binds accelerators to physical
/// keys (US positions), so Ctrl+= would land on a dead key of the
/// Swiss-French layout. The keymap binds the keys by character instead, and
/// Ctrl+mouse wheel zooms too (`src/app/zoom.ts`).
fn zoom_submenu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    Submenu::with_items(
        app,
        "&Zoom",
        true,
        &[
            &item(app, "view.zoom.in", "Zoom &In", None)?,
            &item(app, "view.zoom.out", "Zoom &Out", None)?,
            &item(app, "view.zoom.reset", "&Reset Zoom", None)?,
        ],
    )
}

fn view_menu<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> tauri::Result<Submenu<R>> {
    let sidebar = CheckMenuItem::with_id(
        app,
        "view.toggleSidebar",
        "&Sidebar",
        true,
        settings.sidebar_visible,
        Some("CmdOrCtrl+Shift+L"),
    )?;
    Submenu::with_id_and_items(
        app,
        "menu.view",
        "&View",
        true,
        &[
            &sidebar,
            &theme_submenu(app, settings)?,
            &wrap_submenu(app, settings)?,
            &zoom_submenu(app)?,
        ],
    )
}

fn auto_update_item<R: Runtime>(
    app: &AppHandle<R>,
    settings: &Settings,
) -> tauri::Result<CheckMenuItem<R>> {
    CheckMenuItem::with_id(
        app,
        "help.autoUpdate",
        "Check &Automatically",
        true,
        settings.updates.check == UpdateCheck::Auto,
        None::<&str>,
    )
}

fn help_menu<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> tauri::Result<Submenu<R>> {
    let submenu = Submenu::with_id(app, "menu.help", "&Help", true)?;
    // On macOS the update items and About live in the application menu.
    if !cfg!(target_os = "macos") {
        submenu.append_items(&[
            &item(app, "help.checkUpdates", "Check for &Updates...", None)?,
            &auto_update_item(app, settings)?,
            &PredefinedMenuItem::separator(app)?,
        ])?;
    }
    submenu.append(&item(app, "help.about", "&About GCMD", None)?)?;
    Ok(submenu)
}

/// Builds the full menu for the given settings. On macOS the application
/// menu comes first; on Windows and Linux File is the first menu.
pub fn build<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> tauri::Result<Menu<R>> {
    let menu = Menu::new(app)?;
    #[cfg(target_os = "macos")]
    menu.append(&app_menu(app, settings)?)?;
    menu.append_items(&[
        &file_menu(app, settings)?,
        &edit_menu(app)?,
        &view_menu(app, settings)?,
        &help_menu(app, settings)?,
    ])?;
    Ok(menu)
}

/// Pops up the top-level submenu `id` (`menu.file`, ...) below its title in
/// the menu bar of `window`. Returns `Ok(false)` when the id is unknown.
pub fn popup_top_level<R: Runtime>(
    app: &AppHandle<R>,
    window: Window<R>,
    id: &str,
) -> tauri::Result<bool> {
    let Some((_, x)) = TOP_LEVEL.iter().find(|(name, _)| *name == id) else {
        return Ok(false);
    };
    let Some(menu) = app.menu() else {
        return Ok(false);
    };
    match menu.get(id) {
        Some(MenuItemKind::Submenu(submenu)) => {
            submenu.popup_at(window, LogicalPosition::new(*x, 0.0))?;
            Ok(true)
        }
        _ => Ok(false),
    }
}

/// Builds and installs the menu as the application menu.
pub fn install<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> tauri::Result<()> {
    app.set_menu(build(app, settings)?)?;
    Ok(())
}
