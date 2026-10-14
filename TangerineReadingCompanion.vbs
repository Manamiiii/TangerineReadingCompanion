Option Explicit
Dim shell, files, root, command, result
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
root = files.GetParentFolderName(WScript.ScriptFullName)
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & root & "\scripts\launch-desktop.ps1"""
result = shell.Run(command, 0, True)
If result <> 0 Then MsgBox "Unable to start Tangerine Reading Companion. See artifacts\launcher-error.log in the project folder.", 16, "Tangerine Reading Companion"
