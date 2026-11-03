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
