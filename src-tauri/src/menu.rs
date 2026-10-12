//! Native application menu.
//!
//! Every item id is a frontend command id (see `src/editor/commands/`), so
//! the menu event handler in `lib.rs` just forwards the id over the `menu`
//! event and the frontend runs the command. Recent files use the id
//! `recent:<path>`. The menu is rebuilt whenever the settings change so the
//! recent list and the theme check marks stay current.

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Runtime};

use crate::settings::{Settings, Theme};

/// Prefix of recent-file item ids; the rest is the path.
pub const RECENT_PREFIX: &str = "recent:";
/// Id of the "Clear Recent" item, handled in Rust rather than forwarded.
pub const CLEAR_RECENT_ID: &str = "file.clearRecent";

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

fn file_menu<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> tauri::Result<Submenu<R>> {
    let exit_accelerator = if cfg!(target_os = "windows") {
        None
    } else {
        Some("CmdOrCtrl+Q")
    };
    Submenu::with_items(
        app,
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
            &PredefinedMenuItem::separator(app)?,
            &item(app, "file.exit", "E&xit", exit_accelerator)?,
        ],
    )
}

fn edit_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    // Undo/Redo carry no accelerator on purpose: the key must reach the
    // webview so that an input field (search panel) can handle its own undo.
    Submenu::with_items(
        app,
        "&Edit",
        true,
        &[
            &item(app, "edit.undo", "&Undo", None)?,
            &item(app, "edit.redo", "&Redo", None)?,
            &PredefinedMenuItem::separator(app)?,
            &item(app, "search.find", "&Find...", Some("CmdOrCtrl+F"))?,
            &item(
                app,
                "search.replace",
                "Find and Re&place...",
                Some("CmdOrCtrl+H"),
            )?,
        ],
    )
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

fn view_menu<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> tauri::Result<Submenu<R>> {
    let sidebar = CheckMenuItem::with_id(
        app,
        "view.toggleSidebar",
        "&Sidebar",
        true,
        settings.sidebar_visible,
        None::<&str>,
    )?;
    Submenu::with_items(
        app,
        "&View",
        true,
        &[&sidebar, &theme_submenu(app, settings)?],
    )
}

fn help_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    Submenu::with_items(
        app,
        "&Help",
        true,
        &[&item(app, "help.about", "&About GCMD", None)?],
    )
}

/// Builds the full menu for the given settings.
pub fn build<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> tauri::Result<Menu<R>> {
    Menu::with_items(
        app,
        &[
            &file_menu(app, settings)?,
            &edit_menu(app)?,
            &view_menu(app, settings)?,
            &help_menu(app)?,
        ],
    )
}

/// Builds and installs the menu as the application menu.
pub fn install<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> tauri::Result<()> {
    app.set_menu(build(app, settings)?)?;
    Ok(())
}
