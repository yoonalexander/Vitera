; Only act on shortcuts that target this installation's old binary.
; The installer template preserves the original registry identity across the rename.
Var RenameUpdateMode
Var RenameShortcutMode

!macro NSIS_HOOK_PREINSTALL
  !insertmacro CheckIfAppIsRunning "$INSTDIR\calpal.exe" "CalPal"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  StrCpy $RenameUpdateMode $UpdateMode
  StrCpy $RenameShortcutMode $NoShortcutMode
  StrCpy $UpdateMode 0
  StrCpy $NoShortcutMode 0

  !insertmacro IsShortcutTarget "$SMPROGRAMS\CalPal.lnk" "$INSTDIR\calpal.exe"
  Pop $0
  ${If} $0 = 1
    Call CreateOrUpdateStartMenuShortcut
    ${If} ${FileExists} "$SMPROGRAMS\Vitera.lnk"
      !insertmacro UnpinShortcut "$SMPROGRAMS\CalPal.lnk"
      Delete "$SMPROGRAMS\CalPal.lnk"
    ${EndIf}
  ${EndIf}

  !insertmacro IsShortcutTarget "$DESKTOP\CalPal.lnk" "$INSTDIR\calpal.exe"
  Pop $0
  ${If} $0 = 1
    Call CreateOrUpdateDesktopShortcut
    ${If} ${FileExists} "$DESKTOP\Vitera.lnk"
      !insertmacro UnpinShortcut "$DESKTOP\CalPal.lnk"
      Delete "$DESKTOP\CalPal.lnk"
    ${EndIf}
  ${EndIf}

  ; Older side-by-side test installs can leave the previous binary unregistered.
  ; Only remove it after the new executable has been installed successfully.
  ${If} ${FileExists} "$INSTDIR\vitera.exe"
    Delete "$INSTDIR\calpal.exe"
  ${EndIf}

  StrCpy $UpdateMode $RenameUpdateMode
  StrCpy $NoShortcutMode $RenameShortcutMode
!macroend
