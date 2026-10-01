//! Windows owns filename choice, overwrite confirmation, and filesystem filtering.
use std::path::PathBuf;

#[cfg(windows)]
pub fn save(parent: isize, filename: &str, extension: &str) -> Result<Option<PathBuf>, String> {
    use windows::{
        core::{HSTRING, PCWSTR},
        Win32::{
            Foundation::HWND,
            System::Com::{
                CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize,
                CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
            },
            UI::Shell::{
                Common::COMDLG_FILTERSPEC, FileSaveDialog, IFileSaveDialog, FOS_DONTADDTORECENT,
                FOS_FORCEFILESYSTEM, FOS_OVERWRITEPROMPT, FOS_PATHMUSTEXIST, FOS_STRICTFILETYPES,
                SIGDN_FILESYSPATH,
            },
        },
    };
    struct Com;
    impl Drop for Com {
        fn drop(&mut self) {
            unsafe {
                CoUninitialize();
            }
        }
    }
    let action = || -> windows::core::Result<Option<PathBuf>> {
        // This command runs on its own blocking thread. COM objects and their
        // UTF-16 buffers remain alive on that thread until the dialog is closed.
        unsafe {
            CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok()?;
            let _com = Com;
            let dialog: IFileSaveDialog =
                CoCreateInstance(&FileSaveDialog, None, CLSCTX_INPROC_SERVER)?;
            let name = HSTRING::from(filename);
            let ext = HSTRING::from(extension);
            let pattern = HSTRING::from(format!("*.{extension}"));
            let label = HSTRING::from("CalPal export");
            dialog.SetTitle(&HSTRING::from("Save CalPal export"))?;
            dialog.SetFileName(&name)?;
            dialog.SetDefaultExtension(&ext)?;
            dialog.SetFileTypes(&[COMDLG_FILTERSPEC {
                pszName: PCWSTR(label.as_ptr()),
                pszSpec: PCWSTR(pattern.as_ptr()),
            }])?;
            dialog.SetOptions(
                FOS_FORCEFILESYSTEM
                    | FOS_PATHMUSTEXIST
                    | FOS_OVERWRITEPROMPT
                    | FOS_STRICTFILETYPES
                    | FOS_DONTADDTORECENT,
            )?;
            match dialog.Show(Some(HWND(parent as *mut _))) {
                Ok(()) => {}
                Err(e) if e.code().0 as u32 == 0x800704c7 => return Ok(None), // user cancelled
                Err(e) => return Err(e),
            }
            let item = dialog.GetResult()?;
            let path = item.GetDisplayName(SIGDN_FILESYSPATH)?;
            let value = path.to_string();
            CoTaskMemFree(Some(path.0.cast()));
            Ok(Some(PathBuf::from(value?)))
        }
    };
    action().map_err(|_| {
        "The save dialog could not open. Close any other file dialog and try again.".into()
    })
}

#[cfg(not(windows))]
pub fn save(_: isize, _: &str, _: &str) -> Result<Option<PathBuf>, String> {
    Err("This release supports Windows export dialogs only.".into())
}
