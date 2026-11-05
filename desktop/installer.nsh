; Never kill a reader session: it may contain unsaved, intentionally ephemeral input.
; nsProcess returns 603 when no matching process exists. Other errors fail closed.
!macro customCheckAppRunning
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
  ${If} $R0 != 603
    ${IfNot} ${Silent}
      MessageBox MB_OK|MB_ICONEXCLAMATION "请先退出橘子阅读伴侣，再重试安装或卸载。当前临时输入不会自动保存。$\r$\nPlease close Tangerine Reading Companion before installing or uninstalling."
    ${EndIf}
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

!ifndef READER_LEGACY_FIXTURE
!macro readerRefuse
  MessageBox MB_OK|MB_ICONSTOP "安装登记或目录不属于当前用户的阅读伴侣。请保留现有文件并检查安装位置。" /SD IDOK
  SetErrorLevel 3
  Quit
!macroend

; Reject aliases and junctions on the path before maintenance touches any files.
!macro readerCheckPath DIRECTORY
  StrCpy $0 "${DIRECTORY}"
  ${Do}
    System::Call 'kernel32::GetFileAttributesW(w r0)i.r1'
    ${If} $1 != -1
      IntOp $1 $1 & 0x400
      ${If} $1 != 0
        !insertmacro readerRefuse
      ${EndIf}
    ${EndIf}
    ${GetParent} "$0" $1
    ${If} $1 == ""
    ${OrIf} $1 == $0
      ${ExitDo}
    ${EndIf}
    StrCpy $0 $1
  ${Loop}
!macroend

!macro readerRegisteredDirectory
  ; The root may have been redirected by Windows. Require the exact product leaf,
  ; executable, payload and matching uninstall registration before using an old path.
  ; GetFullPathName needs an existing path; only registered destinations have one.
  GetFullPathName $R6 "$INSTDIR"
  ${If} $R6 != $INSTDIR
    !insertmacro readerRefuse
  ${EndIf}
  ${GetFileName} "$INSTDIR" $R6
  ${If} $R6 != "${PRODUCT_FILENAME}"
  ${OrIfNot} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  ${OrIfNot} ${FileExists} "$INSTDIR\resources\app.asar"
  ${OrIfNot} ${FileExists} "$INSTDIR\${UNINSTALL_FILENAME}"
    !insertmacro readerRefuse
  ${EndIf}
  ReadRegStr $R6 HKCU "${UNINSTALL_REGISTRY_KEY}" UninstallString
  ${If} $R6 != '"$INSTDIR\${UNINSTALL_FILENAME}" /currentuser'
    !insertmacro readerRefuse
  ${EndIf}
  !insertmacro readerCheckPath "$INSTDIR"
!macroend

!macro customInit
  ${If} $installMode != "CurrentUser"
  ${OrIf} ${isForAllUsers}
    !insertmacro readerRefuse
  ${EndIf}
  ReadRegStr $R5 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $R5 == ""
    ReadRegStr $R6 HKCU "${UNINSTALL_REGISTRY_KEY}" UninstallString
    ${If} $R6 != ""
      !insertmacro readerRefuse
    ${EndIf}
    !ifdef READER_PREVIOUS_LAYOUT
      StrCpy $INSTDIR "$LOCALAPPDATA\Programs\Tangerine\${PRODUCT_FILENAME}"
    !else
      StrCpy $INSTDIR "$LOCALAPPDATA\Tangerine\Apps\${PRODUCT_FILENAME}"
    !endif
    !insertmacro readerCheckPath "$INSTDIR"
    ${If} ${FileExists} "$INSTDIR\*.*"
    ${OrIf} ${FileExists} "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
      !insertmacro readerRefuse
    ${EndIf}
  ${Else}
    StrCpy $INSTDIR $R5
    !insertmacro readerRegisteredDirectory
  ${EndIf}
  !insertmacro GetDParameter $R0
  ${If} $R0 != ""
  ${AndIf} $R0 != $INSTDIR
    !insertmacro readerRefuse
  ${EndIf}
!macroend

; The assisted install-mode page would otherwise recalculate the default directory.
!macro customInstallMode
  Abort
!macroend

!macro customUnInstall
  ReadRegStr $R5 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $installMode != "CurrentUser"
  ${OrIf} $INSTDIR != $R5
    !insertmacro readerRefuse
  ${EndIf}
  !insertmacro readerRegisteredDirectory
!macroend
!endif
